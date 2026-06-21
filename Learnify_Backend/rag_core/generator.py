def generate_mcqs_from_context(context: str, chapter_title: str) -> list[dict]:
    """
    ලැබුණු Context එක කියවා MCQ ප්‍රශ්න සාදා දීම.
    (දැනට Dummy ප්‍රශ්න ලබා දේ. පසුව trained_t5_model.generate() මෙතනට සම්බන්ධ කෙරේ)
    """
    # 🧠 AI PHASE: පසුව සැබෑ T5/BART Model Inference එක මෙතන සිදුවේ.
    
    dummy_questions = [
        {
            "Question_Text": f"Based on the course materials provided for '{chapter_title}', what is the primary structural concept discussed?",
            "Option_A": "Architectural Component Protocol",
            "Option_B": "Foundational Logic Framework",
            "Option_C": "System Integration Mechanism",
            "Option_D": "Abstract Virtual Processing",
            "Correct_Answer": "A"
        },
        {
            "Question_Text": f"According to the lecture video and PDF text, which core rule must be verified for '{chapter_title}'?",
            "Option_A": "Manual Optimization Process",
            "Option_B": "Automated Constraints Validation",
            "Option_C": "Legacy Deployment Architecture",
            "Option_D": "Redundant Structural Schema",
            "Correct_Answer": "B"
        }
    ]
    return dummy_questions