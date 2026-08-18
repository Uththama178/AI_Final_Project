"""
Student risk prediction pipeline using artifacts in Learnify_Backend/model_02.

Artifacts (loaded once, lazily):
  1. scaler_selected.pkl      — RobustScaler fit on the selected feature matrix
  2. label_encoders.pkl       — dict of column_name -> LabelEncoder
  3. selected_features.pkl    — ordered list of feature names required by the model
  4. student_risk_model_best.pkl — VotingClassifier (or compatible estimator)

Preprocess / predict sequence (matches training for scaler_selected):
  A. Build a raw feature map from student activity + profile fields
  B. Encode categorical columns with label_encoders.pkl
  C. Filter / order columns using selected_features.pkl
  D. Scale the selected numeric matrix with scaler_selected.pkl
  E. Predict with student_risk_model_best.pkl
"""

from __future__ import annotations

import pickle
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

_MODEL_DIR = Path(__file__).resolve().parent / "model_02"

_lock = threading.Lock()
_artifacts: Optional[Dict[str, Any]] = None


def get_model_dir() -> Path:
    return _MODEL_DIR


def _joblib_or_pickle_load(path: Path) -> Any:
    try:
        import joblib

        return joblib.load(path)
    except Exception:
        with open(path, "rb") as fh:
            return pickle.load(fh)


def _as_feature_list(obj: Any) -> List[str]:
    if obj is None:
        return []
    if isinstance(obj, (list, tuple)):
        return [str(x) for x in obj]
    if isinstance(obj, np.ndarray):
        return [str(x) for x in obj.tolist()]
    if hasattr(obj, "tolist"):
        try:
            return [str(x) for x in obj.tolist()]
        except Exception:
            pass
    raise TypeError(f"selected_features.pkl has unsupported type: {type(obj)}")


def load_risk_artifacts(force_reload: bool = False) -> Dict[str, Any]:
    """
    Load the 4 model_02 artifacts.
    Returns dict keys: scaler, label_encoders, selected_features, model, model_dir
    """
    global _artifacts
    with _lock:
        if _artifacts is not None and not force_reload:
            return _artifacts

        required = {
            "scaler": _MODEL_DIR / "scaler_selected.pkl",
            "label_encoders": _MODEL_DIR / "label_encoders.pkl",
            "selected_features": _MODEL_DIR / "selected_features.pkl",
            "model": _MODEL_DIR / "student_risk_model_best.pkl",
        }
        missing = [p.name for p in required.values() if not p.exists()]
        if missing:
            raise FileNotFoundError(
                f"Missing risk model file(s) in {_MODEL_DIR}: {', '.join(missing)}"
            )

        scaler = _joblib_or_pickle_load(required["scaler"])
        label_encoders = _joblib_or_pickle_load(required["label_encoders"])
        selected_features = _as_feature_list(
            _joblib_or_pickle_load(required["selected_features"])
        )
        model = _joblib_or_pickle_load(required["model"])

        if not isinstance(label_encoders, dict):
            raise TypeError(
                "label_encoders.pkl must be a dict of column_name -> LabelEncoder"
            )
        if not selected_features:
            raise ValueError("selected_features.pkl is empty")

        _artifacts = {
            "scaler": scaler,
            "label_encoders": label_encoders,
            "selected_features": selected_features,
            "model": model,
            "model_dir": str(_MODEL_DIR),
        }
        return _artifacts


def _normalize_key(name: str) -> str:
    return (
        str(name)
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("%", "percent")
    )


# Common aliases so Learnify activity fields can match training column names.
_FEATURE_ALIASES: Dict[str, Tuple[str, ...]] = {
    "marks_obtained": (
        "marks_obtained",
        "marks",
        "mark",
        "score",
        "scores",
        "previous_scores",
        "previous_score",
        "quiz_marks",
        "average_marks",
        "avg_marks",
        "cgpa",
        "gpa",
    ),
    "time_spent_minutes": (
        "time_spent_minutes",
        "time_spent",
        "study_time",
        "study_hours",
        "studyhours",
        "hours_studied",
        "time",
    ),
    "attendance_percentage": (
        "attendance_percentage",
        "attendance",
        "attendance_percent",
        "attendance_%",
        "attendence",
    ),
    "current_grade": (
        "current_grade",
        "grade",
        "student_grade",
        "class",
        "year",
    ),
}


def _resolve_raw_value(feature_name: str, raw: Dict[str, Any]) -> Any:
    """Find a value for a training feature name from the provided raw map."""
    if feature_name in raw:
        return raw[feature_name]

    norm_target = _normalize_key(feature_name)
    normalized_raw = {_normalize_key(k): v for k, v in raw.items()}

    if norm_target in normalized_raw:
        return normalized_raw[norm_target]

    for _canonical, aliases in _FEATURE_ALIASES.items():
        if norm_target in aliases or norm_target == _canonical:
            for alias in aliases:
                if alias in normalized_raw:
                    return normalized_raw[alias]
            if _canonical in normalized_raw:
                return normalized_raw[_canonical]

    # Fuzzy contains match (e.g. "Avg_Marks_Obtained" <-> marks_obtained)
    for key, value in normalized_raw.items():
        if norm_target in key or key in norm_target:
            return value

    return None


def _encode_categorical(value: Any, encoder: Any, column: str) -> int:
    classes = list(getattr(encoder, "classes_", []))
    if value is None or (isinstance(value, float) and np.isnan(value)):
        # Fall back to first known class index
        return 0 if classes else 0

    text = str(value).strip()
    # Try exact / case-insensitive match against known classes
    for candidate in (text, text.title(), text.upper(), text.lower()):
        try:
            return int(encoder.transform([candidate])[0])
        except Exception:
            continue

    # Match ignoring case against encoder.classes_
    lower_map = {str(c).lower(): c for c in classes}
    if text.lower() in lower_map:
        try:
            return int(encoder.transform([lower_map[text.lower()]])[0])
        except Exception:
            pass

    # Unknown category — use most frequent class if available, else 0
    if classes:
        try:
            return int(encoder.transform([classes[0]])[0])
        except Exception:
            return 0
    raise ValueError(f"Cannot encode categorical value for column '{column}': {value!r}")


def preprocess_student_features(raw_features: Dict[str, Any]) -> Tuple[np.ndarray, List[str]]:
    """
    Apply model_02 preprocessing in the correct sequence for prediction:

      1) label_encoders.pkl  — encode categorical columns
      2) selected_features.pkl — keep / order required features
      3) scaler_selected.pkl — RobustScaler on the selected matrix

    Returns (scaled_2d_array, ordered_feature_names).
    """
    arts = load_risk_artifacts()
    selected: List[str] = arts["selected_features"]
    encoders: Dict[str, Any] = arts["label_encoders"]
    scaler = arts["scaler"]

    # --- Build one row aligned to selected_features ---
    row_values: List[float] = []
    for col in selected:
        raw_val = _resolve_raw_value(col, raw_features)

        if col in encoders:
            encoded = _encode_categorical(raw_val, encoders[col], col)
            row_values.append(float(encoded))
            continue

        # Numerical column
        if raw_val is None or raw_val == "":
            row_values.append(0.0)
            continue
        try:
            row_values.append(float(raw_val))
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Feature '{col}' must be numeric after encoding, got {raw_val!r}"
            ) from exc

    matrix = np.asarray([row_values], dtype=float)

    # --- Scale selected features (RobustScaler) ---
    try:
        scaled = scaler.transform(matrix)
    except Exception:
        # Some scalers were fit with feature names (pandas). Retry with DataFrame.
        try:
            import pandas as pd

            scaled = scaler.transform(pd.DataFrame(matrix, columns=selected))
        except Exception as exc:
            raise RuntimeError(f"RobustScaler transform failed: {exc}") from exc

    return np.asarray(scaled, dtype=float), selected


def predict_risk_level(raw_features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Full pipeline:
      label encode → select/order features → scale → VotingClassifier.predict

    Returns prediction label plus metadata.
    """
    arts = load_risk_artifacts()
    model = arts["model"]
    scaled, feature_names = preprocess_student_features(raw_features)

    try:
        pred = model.predict(scaled)
    except Exception:
        try:
            import pandas as pd

            pred = model.predict(pd.DataFrame(scaled, columns=feature_names))
        except Exception as exc:
            raise RuntimeError(f"Risk model prediction failed: {exc}") from exc

    label = pred[0] if hasattr(pred, "__len__") else pred
    label_str = str(label)

    probabilities = None
    if hasattr(model, "predict_proba"):
        try:
            proba = model.predict_proba(scaled)[0]
            classes = list(getattr(model, "classes_", []))
            probabilities = {
                str(classes[i] if i < len(classes) else i): float(proba[i])
                for i in range(len(proba))
            }
        except Exception:
            probabilities = None

    return {
        "Risk_Level": label_str,
        "features_used": feature_names,
        "probabilities": probabilities,
        "model_dir": arts["model_dir"],
    }


# Display-only mapping (does not affect model training or predict()).
RISK_LABEL_DISPLAY = {
    "L": "Low Risk",
    "M": "Medium Risk",
    "H": "High Risk",
    "LOW": "Low Risk",
    "MEDIUM": "Medium Risk",
    "HIGH": "High Risk",
}


def to_display_risk_label(label: Any) -> str:
    """Map raw model codes (e.g. L/M/H) to readable phrases for the UI."""
    if label is None:
        return "Unknown"
    raw = str(label).strip()
    if not raw:
        return "Unknown"
    mapped = RISK_LABEL_DISPLAY.get(raw) or RISK_LABEL_DISPLAY.get(raw.upper())
    if mapped:
        return mapped
    return raw


def normalize_risk_for_db(label: str) -> Optional[str]:
    """
    Map free-form model labels onto AcademicPrediction.Risk_Level
    allowed values: High | Medium | Low.
    Returns None if no safe mapping exists.
    """
    if label is None:
        return None
    text = str(label).strip().lower().replace("_", " ")

    # Single-letter codes from the trained classifier
    if text in ("h", "high"):
        return "High"
    if text in ("m", "medium"):
        return "Medium"
    if text in ("l", "low"):
        return "Low"

    if any(tok in text for tok in ("high", "at risk", "fail", "poor", "critical")):
        return "High"
    if any(tok in text for tok in ("medium", "moderate", "average", "fair")):
        return "Medium"
    if any(
        tok in text
        for tok in ("low", "good", "excellent", "pass", "safe", "strong")
    ):
        return "Low"
    return None


def build_features_from_activities(
    activities: List[Any],
    *,
    current_grade: Optional[str] = None,
    extra_features: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Aggregate StudentActivity rows into a raw feature map the preprocessor understands.
    """
    marks = [float(a.Marks_Obtained) for a in activities if a is not None]
    times = [float(a.Time_Spent_Minutes) for a in activities if a is not None]
    attend = [float(a.Attendance_Percentage) for a in activities if a is not None]

    raw: Dict[str, Any] = {
        "Marks_Obtained": float(np.mean(marks)) if marks else 0.0,
        "Time_Spent_Minutes": float(np.mean(times)) if times else 0.0,
        "Attendance_Percentage": float(np.mean(attend)) if attend else 0.0,
        "marks": float(np.mean(marks)) if marks else 0.0,
        "attendance": float(np.mean(attend)) if attend else 0.0,
        "study_hours": float(np.mean(times)) if times else 0.0,
    }
    if current_grade is not None and str(current_grade).strip():
        raw["Current_Grade"] = str(current_grade).strip()
        raw["grade"] = str(current_grade).strip()

    if extra_features:
        for key, value in extra_features.items():
            if value is not None:
                raw[str(key)] = value

    return raw
