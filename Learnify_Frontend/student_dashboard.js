/**
 * Learnify Student Dashboard — dynamic UI bindings
 * Displays logged-in student name and wires sidebar/tab/logout behavior.
 * Also loads published catalog, enrollment, My Courses content, and ratings.
 */
document.addEventListener("DOMContentLoaded", function () {

    // ==========================================
    // GLOBAL CONFIGURATION
    // ==========================================
    const API_BASE_URL = "http://127.0.0.1:8000";

    // ==========================================
    // 1. ROUTE GUARD
    // ==========================================
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("user_role");
    const userName = localStorage.getItem("user_name");
    const userEmail = localStorage.getItem("user_email");

    if (!token || !role || (role.toLowerCase() !== "student" && role.toLowerCase() !== "both")) {
        alert("Access Denied! Please login as a Student.");
        window.location.href = "login.html";
        return;
    }

    console.log("✅ Student logged in:", userName);

    // ==========================================
    // 2. DISPLAY STUDENT NAME (HEADER + META)
    // ==========================================
    const displayName = userName && String(userName).trim() ? String(userName).trim() : "Student";
    const displayEmail = userEmail && String(userEmail).trim() ? String(userEmail).trim() : "student@learnify.com";

    const studentNameEl = document.getElementById("student-name");
    const studentDisplayNameEl = document.getElementById("student-display-name");
    const studentDisplayEmailEl = document.getElementById("student-display-email");

    if (studentNameEl) {
        studentNameEl.textContent = displayName;
    }
    if (studentDisplayNameEl) {
        studentDisplayNameEl.textContent = displayName;
    }
    if (studentDisplayEmailEl) {
        studentDisplayEmailEl.textContent = displayEmail;
    }

    // ==========================================
    // 3. SIDEBAR TAB NAVIGATION
    // ==========================================
    const menuItems = document.querySelectorAll(".student-menu .student-menu-item");
    const tabContents = document.querySelectorAll(".student-tab-content");

    menuItems.forEach((item) => {
        item.addEventListener("click", function () {
            menuItems.forEach((i) => i.classList.remove("active"));
            tabContents.forEach((tc) => tc.classList.remove("active"));

            this.classList.add("active");
            const tabId = this.getAttribute("data-tab");
            const targetTab = document.getElementById(tabId);
            if (targetTab) {
                targetTab.classList.add("active");
            }

            if (tabId === "courses") {
                loadAvailableCourses();
            } else if (tabId === "my-courses") {
                loadMyCourses();
            } else if (tabId === "finish-courses") {
                loadFinishedCourses();
            } else if (tabId === "course-result") {
                loadCourseResults();
            } else if (tabId === "recommendations") {
                loadRecommendations();
            }
        });
    });

    // ==========================================
    // 4. LOGOUT
    // ==========================================
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", function () {
            localStorage.clear();
            alert("Logged out successfully!");
            window.location.href = "login.html";
        });
    }

    // ==========================================
    // 5. SHARED AUTH HEADER HELPER (for future API calls)
    // ==========================================
    function getAuthHeaders() {
        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
    }

    // ==========================================
    // 6. PUBLISH / ENROLL WORKFLOW HELPERS
    // ==========================================
    let enrolledCoursesCache = [];

    function escapeHtml(text) {
        if (text === null || text === undefined) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatPrice(price) {
        const n = Number(price);
        if (Number.isNaN(n)) return "LKR 0.00";
        return `LKR ${n.toFixed(2)}`;
    }

    function buildPdfUrl(pdfPath) {
        if (!pdfPath) return null;
        let path = String(pdfPath).replace(/\\/g, "/").trim();
        if (/^https?:\/\//i.test(path)) return path;
        path = path.replace(/^\/+/, "");
        if (!path.toLowerCase().startsWith("uploads/")) {
            path = path.startsWith("pdfs/") ? `uploads/${path}` : `uploads/pdfs/${path}`;
        }
        return `${API_BASE_URL}/${path}`;
    }

    function toYouTubeEmbed(url) {
        if (!url) return null;
        let raw = String(url).trim();
        raw = raw.replace(/&amp;/gi, "&").replace(/&#38;/g, "&").replace(/&quot;/gi, '"');
        const patterns = [
            /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/,
        ];
        for (const re of patterns) {
            const m = raw.match(re);
            if (m && m[1]) {
                return `https://www.youtube.com/embed/${m[1]}?rel=0`;
            }
        }
        return null;
    }

    function ensureEmptyState(container, emptyId, iconClass, message) {
        if (!container) return;
        let empty = document.getElementById(emptyId);
        if (!empty) {
            empty = document.createElement("div");
            empty.className = "student-empty-state";
            empty.id = emptyId;
            container.appendChild(empty);
        }
        empty.innerHTML = `<i class="fa-solid ${iconClass}"></i><p>${escapeHtml(message)}</p>`;
        empty.hidden = false;
        return empty;
    }

    function clearCourseCards(container, emptyId) {
        if (!container) return;
        container.querySelectorAll(".sd-course-card").forEach((el) => el.remove());
        const empty = document.getElementById(emptyId);
        if (empty) empty.hidden = false;
    }

    async function apiJson(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...getAuthHeaders(),
                ...(options.headers || {}),
            },
        });
        if (!response.ok) {
            let detail = `Request failed (${response.status})`;
            try {
                const err = await response.json();
                detail = err.detail || detail;
            } catch (_) {}
            throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
        }
        if (response.status === 204) return null;
        return response.json();
    }

    // ------------------------------------------
    // Available Courses (published catalog)
    // ------------------------------------------
    function createCatalogCard(course) {
        const card = document.createElement("article");
        card.className = "sd-course-card sd-catalog-card";
        card.dataset.courseId = course.Course_ID;

        const chapterLabel =
            course.chapter_count === 1 ? "1 Chapter" : `${course.chapter_count || 0} Chapters`;

        card.innerHTML = `
            <div class="sd-course-card-body">
                <div class="sd-course-card-top">
                    <span class="sd-chip"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(chapterLabel)}</span>
                    <span class="sd-chip sd-chip-price">${escapeHtml(formatPrice(course.Price))}</span>
                </div>
                <h3 class="sd-course-title">${escapeHtml(course.Title || "Untitled Course")}</h3>
                <p class="sd-course-desc">${escapeHtml(
                    (course.Description && String(course.Description).trim()) || "No description provided."
                )}</p>
                <p class="sd-course-teacher">
                    <i class="fa-solid fa-chalkboard-user"></i>
                    ${escapeHtml(course.Teacher_Name || "Unknown Teacher")}
                </p>
                <div class="sd-course-actions">
                    <button type="button" class="sd-btn sd-btn-enroll" data-course-id="${course.Course_ID}">
                        <i class="fa-solid fa-user-plus"></i> Enroll
                    </button>
                </div>
            </div>
        `;

        const enrollBtn = card.querySelector(".sd-btn-enroll");
        if (enrollBtn) {
            enrollBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                enrollInCourse(course, card, enrollBtn);
            });
        }

        return card;
    }

    async function loadAvailableCourses() {
        const container = document.getElementById("available-courses-container");
        if (!container) return;

        clearCourseCards(container, "available-courses-empty");
        const empty = ensureEmptyState(
            container,
            "available-courses-empty",
            "fa-spinner fa-spin",
            "Loading published courses..."
        );

        try {
            const courses = await apiJson(`${API_BASE_URL}/student/courses`);
            container.querySelectorAll(".sd-course-card").forEach((el) => el.remove());

            if (!Array.isArray(courses) || courses.length === 0) {
                ensureEmptyState(
                    container,
                    "available-courses-empty",
                    "fa-layer-group",
                    "No published courses available right now."
                );
                return;
            }

            if (empty) empty.hidden = true;
            courses.forEach((course) => {
                container.appendChild(createCatalogCard(course));
            });
        } catch (err) {
            console.error(err);
            ensureEmptyState(
                container,
                "available-courses-empty",
                "fa-triangle-exclamation",
                err.message || "Could not load courses."
            );
        }
    }

    // ------------------------------------------
    // Recommendations (reuse catalog cards + enroll)
    // ------------------------------------------
    async function loadRecommendations() {
        const container = document.getElementById("recommendations-container");
        if (!container) return;

        clearCourseCards(container, "recommendations-empty");
        const empty = ensureEmptyState(
            container,
            "recommendations-empty",
            "fa-spinner fa-spin",
            "Loading personalized recommendations..."
        );

        try {
            const data = await apiJson(`${API_BASE_URL}/student/recommendations`);
            const recommended = Array.isArray(data && data.recommended_courses)
                ? data.recommended_courses
                : [];

            container.querySelectorAll(".sd-course-card").forEach((el) => el.remove());

            if (!recommended.length) {
                ensureEmptyState(
                    container,
                    "recommendations-empty",
                    "fa-lightbulb",
                    "No recommendations yet. Enroll in a course to get related suggestions."
                );
                return;
            }

            if (empty) empty.hidden = true;
            recommended.forEach((course) => {
                container.appendChild(createCatalogCard(course));
            });
        } catch (err) {
            console.error(err);
            ensureEmptyState(
                container,
                "recommendations-empty",
                "fa-triangle-exclamation",
                err.message || "Could not load recommendations."
            );
        }
    }

    async function enrollInCourse(course, card, enrollBtn) {
        if (!course || !course.Course_ID) return;

        const originalHtml = enrollBtn ? enrollBtn.innerHTML : "";
        if (enrollBtn) {
            enrollBtn.disabled = true;
            enrollBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enrolling...`;
        }

        try {
            await apiJson(`${API_BASE_URL}/student/enroll/${course.Course_ID}`, {
                method: "POST",
                body: "{}",
            });

            if (card && card.parentNode) {
                card.remove();
            }

            const catalog = document.getElementById("available-courses-container");
            if (catalog && !catalog.querySelector(".sd-course-card")) {
                ensureEmptyState(
                    catalog,
                    "available-courses-empty",
                    "fa-layer-group",
                    "No published courses available right now."
                );
            }

            await loadMyCourses({ silent: true });

            // Switch to My Courses so the enrolled card is visible
            const myCoursesNav = document.getElementById("nav-my-courses");
            if (myCoursesNav) {
                myCoursesNav.click();
            }

            alert(`Successfully enrolled in "${course.Title || "course"}".`);
        } catch (err) {
            console.error(err);
            alert(`❌ ${err.message}`);
            if (enrollBtn) {
                enrollBtn.disabled = false;
                enrollBtn.innerHTML = originalHtml;
            }
        }
    }

    // ------------------------------------------
    // My Courses (enrolled) + 5-star ratings
    // ------------------------------------------
    function renderStarRating(courseId, currentStars) {
        const stars = Number(currentStars) || 0;
        let html = `<div class="sd-star-rating" data-course-id="${courseId}" data-enrolled="true" role="group" aria-label="Rate this course">`;
        for (let i = 1; i <= 5; i += 1) {
            const active = i <= stars ? "is-active" : "";
            html += `<button type="button" class="sd-star-btn ${active}" data-stars="${i}" aria-label="${i} star${i > 1 ? "s" : ""}">
                <i class="fa-solid fa-star"></i>
            </button>`;
        }
        html += `<span class="sd-star-hint">${stars ? `${stars}/5` : "Rate this course"}</span></div>`;
        return html;
    }

    function createMyCourseCard(course) {
        const card = document.createElement("article");
        card.className = "sd-course-card sd-enrolled-card";
        card.dataset.courseId = course.Course_ID;
        card.tabIndex = 0;

        card.innerHTML = `
            <div class="sd-course-card-body">
                <div class="sd-course-card-top">
                    <span class="sd-chip sd-chip-enrolled"><i class="fa-solid fa-circle-check"></i> Enrolled</span>
                    <span class="sd-chip sd-chip-price">${escapeHtml(formatPrice(course.Price))}</span>
                </div>
                <h3 class="sd-course-title">${escapeHtml(course.Title || "Untitled Course")}</h3>
                <p class="sd-course-desc">${escapeHtml(
                    (course.Description && String(course.Description).trim()) || "No description provided."
                )}</p>
                <p class="sd-course-teacher">
                    <i class="fa-solid fa-chalkboard-user"></i>
                    ${escapeHtml(course.Teacher_Name || "Unknown Teacher")}
                </p>
                ${renderStarRating(course.Course_ID, course.Rating_Stars)}
                <div class="sd-course-actions">
                    <button type="button" class="sd-btn sd-btn-open-course">
                        <i class="fa-solid fa-book-open-reader"></i> Open Course
                    </button>
                </div>
            </div>
        `;

        const openBtn = card.querySelector(".sd-btn-open-course");
        if (openBtn) {
            openBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openEnrolledCourseView(course);
            });
        }

        card.addEventListener("click", (e) => {
            if (e.target.closest(".sd-star-rating") || e.target.closest("button")) return;
            openEnrolledCourseView(course);
        });

        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                if (e.target.closest(".sd-star-btn")) return;
                e.preventDefault();
                openEnrolledCourseView(course);
            }
        });

        // Rating only for enrolled courses (this card is enrolled-only)
        const ratingRoot = card.querySelector(".sd-star-rating");
        if (ratingRoot && ratingRoot.dataset.enrolled === "true") {
            ratingRoot.querySelectorAll(".sd-star-btn").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const stars = Number(btn.dataset.stars);
                    submitCourseRating(course, stars, ratingRoot);
                });
            });
        }

        return card;
    }

    async function submitCourseRating(course, stars, ratingRoot) {
        if (!course || !course.Course_ID) return;
        if (!stars || stars < 1 || stars > 5) return;

        const hint = ratingRoot ? ratingRoot.querySelector(".sd-star-hint") : null;
        const prevHint = hint ? hint.textContent : "";
        if (hint) hint.textContent = "Saving...";

        try {
            const data = await apiJson(`${API_BASE_URL}/student/rate-course/${course.Course_ID}`, {
                method: "POST",
                body: JSON.stringify({ Rating_Stars: stars }),
            });

            course.Rating_Stars = data.Rating_Stars || stars;
            if (ratingRoot) {
                ratingRoot.querySelectorAll(".sd-star-btn").forEach((btn) => {
                    const n = Number(btn.dataset.stars);
                    btn.classList.toggle("is-active", n <= course.Rating_Stars);
                });
                if (hint) hint.textContent = `${course.Rating_Stars}/5`;
            }

            const cached = enrolledCoursesCache.find((c) => c.Course_ID === course.Course_ID);
            if (cached) cached.Rating_Stars = course.Rating_Stars;
        } catch (err) {
            console.error(err);
            alert(`❌ ${err.message}`);
            if (hint) hint.textContent = prevHint || "Rate this course";
        }
    }

    async function loadMyCourses(options = {}) {
        const container = document.getElementById("my-courses-container");
        if (!container) return;

        clearCourseCards(container, "my-courses-empty");
        const empty = ensureEmptyState(
            container,
            "my-courses-empty",
            "fa-spinner fa-spin",
            "Loading your enrolled courses..."
        );

        try {
            const courses = await apiJson(`${API_BASE_URL}/student/my-courses`);
            enrolledCoursesCache = Array.isArray(courses) ? courses : [];
            container.querySelectorAll(".sd-course-card").forEach((el) => el.remove());

            if (!enrolledCoursesCache.length) {
                ensureEmptyState(
                    container,
                    "my-courses-empty",
                    "fa-bookmark",
                    "You have not enrolled in any courses yet."
                );
                return;
            }

            if (empty) empty.hidden = true;
            enrolledCoursesCache.forEach((course) => {
                // Finished courses move to the Finished Courses table
                if (isCourseFullyCompleted(course)) return;
                container.appendChild(createMyCourseCard(course));
            });

            if (!container.querySelector(".sd-course-card")) {
                ensureEmptyState(
                    container,
                    "my-courses-empty",
                    "fa-bookmark",
                    enrolledCoursesCache.length
                        ? "All enrolled courses are finished. Check the Finished Courses tab."
                        : "You have not enrolled in any courses yet."
                );
            }

            loadFinishedCourses({ silent: true });
        } catch (err) {
            console.error(err);
            if (!options.silent) {
                ensureEmptyState(
                    container,
                    "my-courses-empty",
                    "fa-triangle-exclamation",
                    err.message || "Could not load enrolled courses."
                );
            }
        }
    }

    // ------------------------------------------
    // Finished Courses — table view (all chapters done)
    // ------------------------------------------
    function formatDisplayDate(value) {
        if (!value) return "—";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
            const asText = String(value).trim();
            return asText || "—";
        }
        return d.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    function formatChapterWiseMarks(course, progress) {
        const chapters = getSortedChapters(course);
        if (!chapters.length) return "—";

        return chapters
            .map((ch, idx) => {
                const label = `Ch${ch.Chapter_Number || idx + 1}`;
                const local = progress.quizResults[String(ch.Chapter_ID)];
                if (local && local.Marks_Obtained != null && !Number.isNaN(Number(local.Marks_Obtained))) {
                    return `${label}: ${Number(local.Marks_Obtained)}%`;
                }
                if (isChapterComplete(progress, ch.Chapter_ID)) {
                    return `${label}: Done`;
                }
                return `${label}: —`;
            })
            .join(" · ");
    }

    function loadFinishedCourses(options = {}) {
        const container = document.getElementById("finish-courses-container");
        const empty = document.getElementById("finish-courses-empty");
        const tableWrap = document.getElementById("finish-courses-table-wrap");
        const tbody = document.getElementById("finish-courses-tbody");
        if (!container || !tbody) return;

        const finished = (enrolledCoursesCache || []).filter((course) => isCourseFullyCompleted(course));

        tbody.innerHTML = "";

        if (!finished.length) {
            if (tableWrap) tableWrap.hidden = true;
            if (empty) {
                empty.hidden = false;
                empty.innerHTML = `<i class="fa-solid fa-flag-checkered"></i><p>No finished courses yet. Keep learning!</p>`;
            }
            loadCourseResults({ silent: true });
            return;
        }

        if (empty) empty.hidden = true;
        if (tableWrap) tableWrap.hidden = false;

        finished.forEach((course) => {
            let progress = loadChapterProgress(course.Course_ID);
            if (!progress.completedAt) {
                progress = markCourseFinished(course.Course_ID);
            }
            if (!progress.startedAt && course.Enrollment_Date) {
                progress = ensureCourseStartedAt(course.Course_ID, course.Enrollment_Date);
            }

            const startDate = progress.startedAt || course.Enrollment_Date || null;
            const endDate = progress.completedAt || null;

            const tr = document.createElement("tr");
            tr.dataset.courseId = course.Course_ID;
            tr.innerHTML = `
                <td data-label="Course Name">${escapeHtml(course.Title || "Untitled Course")}</td>
                <td data-label="Teacher">${escapeHtml(course.Teacher_Name || "Unknown Teacher")}</td>
                <td data-label="Chapter-wise Marks">${escapeHtml(formatChapterWiseMarks(course, progress))}</td>
                <td data-label="Course Start Date">${escapeHtml(formatDisplayDate(startDate))}</td>
                <td data-label="Course End Date">${escapeHtml(formatDisplayDate(endDate))}</td>
            `;
            tbody.appendChild(tr);
        });

        if (!options.silent) {
            console.log(`Finished courses loaded: ${finished.length}`);
        }

        loadCourseResults({ silent: true });
    }

    // ------------------------------------------
    // Course Results — finished courses + risk badges
    // ------------------------------------------
    function riskPredictionCacheKey(courseId) {
        const who = (displayEmail || displayName || "student").toLowerCase();
        return `learnify_risk_prediction_${who}_${courseId}`;
    }

    function loadCachedRiskPrediction(courseId) {
        try {
            const raw = localStorage.getItem(riskPredictionCacheKey(courseId));
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function saveCachedRiskPrediction(courseId, data) {
        localStorage.setItem(
            riskPredictionCacheKey(courseId),
            JSON.stringify({
                Risk_Level: data.Risk_Level,
                Risk_Level_Normalized: data.Risk_Level_Normalized || null,
                savedAt: new Date().toISOString(),
            })
        );
    }

    function mapRiskLabelForDisplay(label) {
        // Frontend-only display mapping (API still returns Low/Medium/High Risk).
        // Low → Excellent | Medium → Good | High → Risk
        const RISK_LABEL_DISPLAY = {
            L: "Excellent",
            M: "Good",
            H: "Risk",
            l: "Excellent",
            m: "Good",
            h: "Risk",
            Low: "Excellent",
            Medium: "Good",
            High: "Risk",
            LOW: "Excellent",
            MEDIUM: "Good",
            HIGH: "Risk",
            "Low Risk": "Excellent",
            "Medium Risk": "Good",
            "High Risk": "Risk",
            "low risk": "Excellent",
            "medium risk": "Good",
            "high risk": "Risk",
        };
        const raw = String(label == null ? "" : label).trim();
        if (!raw) return "";
        if (RISK_LABEL_DISPLAY[raw]) return RISK_LABEL_DISPLAY[raw];
        if (RISK_LABEL_DISPLAY[raw.toUpperCase()]) return RISK_LABEL_DISPLAY[raw.toUpperCase()];

        const lower = raw.toLowerCase().replace(/_/g, " ");
        if (lower === "low" || lower === "low risk") return "Excellent";
        if (lower === "medium" || lower === "medium risk") return "Good";
        if (lower === "high" || lower === "high risk") return "Risk";
        return raw;
    }

    function classifyRiskTone(label) {
        // Keep CSS tones aligned with original risk severity (not renamed labels).
        const text = String(label || "").toLowerCase().replace(/_/g, " ").trim();
        if (!text) return "unknown";
        if (
            text === "h" ||
            text === "high" ||
            text === "high risk" ||
            text === "risk"
        ) {
            return "high";
        }
        if (
            text === "m" ||
            text === "medium" ||
            text === "medium risk" ||
            text === "good"
        ) {
            return "medium";
        }
        if (
            text === "l" ||
            text === "low" ||
            text === "low risk" ||
            text === "excellent"
        ) {
            return "low";
        }
        if (
            text.includes("high") ||
            text.includes("fail") ||
            text.includes("poor") ||
            text.includes("critical") ||
            text.includes("at risk")
        ) {
            return "high";
        }
        if (
            text.includes("medium") ||
            text.includes("moderate") ||
            text.includes("average") ||
            text.includes("fair") ||
            text.includes("good")
        ) {
            return "medium";
        }
        if (
            text.includes("low") ||
            text.includes("excellent") ||
            text.includes("pass") ||
            text.includes("safe") ||
            text.includes("strong")
        ) {
            return "low";
        }
        return "unknown";
    }

    function formatRiskBadge(label, normalized) {
        const display =
            mapRiskLabelForDisplay(label) ||
            mapRiskLabelForDisplay(normalized) ||
            "Pending";
        // Tone from API/raw labels so "Excellent" still uses the low-risk (green) style
        const tone = classifyRiskTone(label || normalized || display);
        return `<span class="sd-risk-badge sd-risk-${tone}">${escapeHtml(display)}</span>`;
    }

    async function fetchRiskForCourse(courseId) {
        const cached = loadCachedRiskPrediction(courseId);
        if (cached && cached.Risk_Level) {
            return cached;
        }

        const data = await apiJson(`${API_BASE_URL}/student/predict-risk`, {
            method: "POST",
            body: JSON.stringify({ Course_ID: courseId }),
        });

        const prediction = {
            Risk_Level: data.Risk_Level,
            Risk_Level_Normalized: data.Risk_Level_Normalized || null,
        };
        saveCachedRiskPrediction(courseId, prediction);
        return prediction;
    }

    async function loadCourseResults(options = {}) {
        const empty = document.getElementById("course-results-empty");
        const tableWrap = document.getElementById("course-results-table-wrap");
        const tbody = document.getElementById("course-results-tbody");
        if (!tbody) return;

        // Ensure enrolled cache is available
        if (!enrolledCoursesCache.length) {
            try {
                const courses = await apiJson(`${API_BASE_URL}/student/my-courses`);
                enrolledCoursesCache = Array.isArray(courses) ? courses : [];
            } catch (err) {
                console.error(err);
                if (tableWrap) tableWrap.hidden = true;
                if (empty) {
                    empty.hidden = false;
                    empty.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(
                        err.message || "Could not load course results."
                    )}</p>`;
                }
                return;
            }
        }

        const finished = (enrolledCoursesCache || []).filter((course) => isCourseFullyCompleted(course));
        tbody.innerHTML = "";

        if (!finished.length) {
            if (tableWrap) tableWrap.hidden = true;
            if (empty) {
                empty.hidden = false;
                empty.innerHTML = `<i class="fa-solid fa-chart-column"></i><p>Results will appear here after you complete a full course.</p>`;
            }
            return;
        }

        if (empty) {
            empty.hidden = false;
            empty.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><p>Loading predicted results...</p>`;
        }
        if (tableWrap) tableWrap.hidden = true;

        const rows = [];
        for (const course of finished) {
            let prediction = null;
            let errorText = null;
            try {
                prediction = await fetchRiskForCourse(course.Course_ID);
            } catch (err) {
                console.error(err);
                errorText = err.message || "Prediction unavailable";
            }

            const badgeHtml = prediction
                ? formatRiskBadge(prediction.Risk_Level, prediction.Risk_Level_Normalized)
                : `<span class="sd-risk-badge sd-risk-unknown">${escapeHtml(errorText || "Pending")}</span>`;

            rows.push(`
                <tr data-course-id="${course.Course_ID}">
                    <td data-label="Course Name">
                        <span class="sd-result-course-name">${escapeHtml(course.Title || "Untitled Course")}</span>
                    </td>
                    <td data-label="Predicted Performance">${badgeHtml}</td>
                </tr>
            `);
        }

        tbody.innerHTML = rows.join("");
        if (empty) empty.hidden = true;
        if (tableWrap) tableWrap.hidden = false;

        if (!options.silent) {
            console.log(`Course results loaded: ${finished.length}`);
        }
    }

    // ------------------------------------------
    // Enrolled course content overlay (chapter-by-chapter)
    // Interactive MCQs unlock locally; DB save only on FINAL chapter quiz.
    // ------------------------------------------
    let activeCourseView = null;
    const chapterTimers = {}; // chapterId -> start timestamp (ms)

    function chapterProgressKey(courseId) {
        const who = (displayEmail || displayName || "student").toLowerCase();
        return `learnify_chapter_progress_${who}_${courseId}`;
    }

    function loadChapterProgress(courseId) {
        try {
            const raw = localStorage.getItem(chapterProgressKey(courseId));
            if (!raw) {
                return {
                    completedChapterIds: [],
                    quizResults: {},
                    dbSynced: false,
                    startedAt: null,
                    completedAt: null,
                };
            }
            const parsed = JSON.parse(raw);
            return {
                completedChapterIds: Array.isArray(parsed.completedChapterIds)
                    ? parsed.completedChapterIds.map(Number)
                    : [],
                quizResults:
                    parsed.quizResults && typeof parsed.quizResults === "object"
                        ? parsed.quizResults
                        : {},
                dbSynced: Boolean(parsed.dbSynced),
                startedAt: parsed.startedAt || null,
                completedAt: parsed.completedAt || null,
            };
        } catch (_) {
            return {
                completedChapterIds: [],
                quizResults: {},
                dbSynced: false,
                startedAt: null,
                completedAt: null,
            };
        }
    }

    function saveChapterProgress(courseId, progress) {
        localStorage.setItem(
            chapterProgressKey(courseId),
            JSON.stringify({
                completedChapterIds: Array.isArray(progress.completedChapterIds)
                    ? progress.completedChapterIds
                    : [],
                quizResults: progress.quizResults || {},
                dbSynced: Boolean(progress.dbSynced),
                startedAt: progress.startedAt || null,
                completedAt: progress.completedAt || null,
            })
        );
    }

    function ensureCourseStartedAt(courseId, enrollmentDate) {
        const progress = loadChapterProgress(courseId);
        if (!progress.startedAt) {
            progress.startedAt = enrollmentDate || new Date().toISOString();
            saveChapterProgress(courseId, progress);
        }
        return progress;
    }

    function markCourseFinished(courseId) {
        const progress = loadChapterProgress(courseId);
        if (!progress.completedAt) {
            progress.completedAt = new Date().toISOString();
        }
        if (!progress.startedAt) {
            progress.startedAt = new Date().toISOString();
        }
        saveChapterProgress(courseId, progress);
        return progress;
    }

    function isCourseFullyCompleted(course) {
        if (!course || !course.Course_ID) return false;
        const chapters = getSortedChapters(course);
        if (!chapters.length) return false;
        const progress = loadChapterProgress(course.Course_ID);
        return chapters.every((ch) => isChapterComplete(progress, ch.Chapter_ID));
    }

    function markChapterComplete(courseId, chapterId) {
        const progress = loadChapterProgress(courseId);
        const id = Number(chapterId);
        if (!progress.completedChapterIds.includes(id)) {
            progress.completedChapterIds.push(id);
            saveChapterProgress(courseId, progress);
        }
        return progress;
    }

    function storeLocalQuizResult(courseId, chapterId, result) {
        const progress = loadChapterProgress(courseId);
        progress.quizResults[String(chapterId)] = result;
        saveChapterProgress(courseId, progress);
        return progress;
    }

    function isChapterComplete(progress, chapterId) {
        return progress.completedChapterIds.includes(Number(chapterId));
    }

    function isFinalChapterIndex(chapters, index) {
        return Array.isArray(chapters) && chapters.length > 0 && index === chapters.length - 1;
    }

    function getChapterIndex(chapters, chapterId) {
        return chapters.findIndex((ch) => Number(ch.Chapter_ID) === Number(chapterId));
    }

    function startChapterTimer(chapterId) {
        const id = String(chapterId);
        if (!chapterTimers[id]) {
            chapterTimers[id] = Date.now();
        }
    }

    function getChapterTimeSpentMinutes(chapterId) {
        const started = chapterTimers[String(chapterId)];
        if (!started) return 1;
        return Math.max(1, Math.round((Date.now() - started) / 60000));
    }

    function getSortedChapters(course) {
        return (Array.isArray(course.chapters) ? course.chapters : [])
            .slice()
            .sort((a, b) => (a.Chapter_Number || 0) - (b.Chapter_Number || 0));
    }

    /** Chapter N is unlocked when all previous chapters are completed (quiz submitted). */
    function isChapterUnlocked(chapters, progress, index) {
        if (index <= 0) return true;
        for (let i = 0; i < index; i += 1) {
            if (!isChapterComplete(progress, chapters[i].Chapter_ID)) return false;
        }
        return true;
    }

    function firstUnlockedIncompleteIndex(chapters, progress) {
        for (let i = 0; i < chapters.length; i += 1) {
            if (
                isChapterUnlocked(chapters, progress, i) &&
                !isChapterComplete(progress, chapters[i].Chapter_ID)
            ) {
                return i;
            }
        }
        return Math.max(0, chapters.length - 1);
    }

    function stopChapterVideos(root) {
        if (!root) return;
        root.querySelectorAll(".sd-video-wrap iframe").forEach((iframe) => {
            iframe.src = "";
        });
    }

    function buildChapterMediaHtml(ch) {
        const videoEmbed = toYouTubeEmbed(ch.Video_Link_Or_Path);
        const pdfUrl = buildPdfUrl(ch.PDF_Link_Or_Path);
        let mediaHtml = `<div class="sd-chapter-media">`;

        if (videoEmbed) {
            mediaHtml += `
                <div class="sd-video-wrap">
                    <iframe data-src="${escapeHtml(videoEmbed)}" src="" title="Chapter video"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
                </div>`;
        } else if (ch.Video_Link_Or_Path) {
            mediaHtml += `<p class="sd-media-note"><i class="fa-solid fa-video"></i> Video: ${escapeHtml(
                ch.Video_Link_Or_Path
            )}</p>`;
        } else {
            mediaHtml += `<p class="sd-media-note muted">No video for this chapter.</p>`;
        }

        if (pdfUrl) {
            mediaHtml += `<a class="sd-btn sd-btn-pdf" href="${escapeHtml(
                pdfUrl
            )}" target="_blank" rel="noopener noreferrer">
                <i class="fa-solid fa-file-pdf"></i> Open PDF
            </a>`;
        } else {
            mediaHtml += `<p class="sd-media-note muted">No PDF for this chapter.</p>`;
        }

        mediaHtml += `</div>`;
        return mediaHtml;
    }

    function buildInteractiveQuizHtml(ch, isFinal) {
        const quiz = ch.quiz;
        if (!quiz) {
            return `
                <div class="sd-chapter-quiz">
                    <p class="sd-media-note muted">No quiz for this chapter. Mark it complete to continue.</p>
                    <button type="button" class="sd-btn sd-btn-complete-chapter" data-chapter-id="${ch.Chapter_ID}">
                        <i class="fa-solid fa-check"></i> ${
                            isFinal ? "Complete Course" : "Mark Chapter Complete"
                        }
                    </button>
                </div>`;
        }

        const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
        if (!questions.length) {
            return `
                <div class="sd-chapter-quiz">
                    <h4><i class="fa-solid fa-list-check"></i> ${escapeHtml(quiz.Quiz_Title || "Chapter Quiz")}</h4>
                    <p class="sd-media-note muted">No questions in this quiz yet.</p>
                    <button type="button" class="sd-btn sd-btn-complete-chapter" data-chapter-id="${ch.Chapter_ID}">
                        <i class="fa-solid fa-check"></i> ${
                            isFinal ? "Complete Course" : "Mark Chapter Complete"
                        }
                    </button>
                </div>`;
        }

        const questionsHtml = questions
            .map((q, idx) => {
                const name = `sd-q-${ch.Chapter_ID}-${q.Question_ID || idx}`;
                return `
                    <div class="sd-quiz-question" data-question-id="${q.Question_ID || idx}" data-correct="${escapeHtml(
                        String(q.Correct_Answer || "").trim().toUpperCase()
                    )}">
                        <p class="sd-q-text"><strong>Q${idx + 1}.</strong> ${escapeHtml(q.Question_Text || "")}</p>
                        <div class="sd-q-options-interactive" role="radiogroup" aria-label="Question ${idx + 1}">
                            ${["A", "B", "C", "D"]
                                .map((letter) => {
                                    const text = q[`Option_${letter}`] || "";
                                    const id = `${name}-${letter}`;
                                    return `
                                        <label class="sd-q-option" for="${id}">
                                            <input type="radio" id="${id}" name="${name}" value="${letter}">
                                            <span>${letter}. ${escapeHtml(text)}</span>
                                        </label>`;
                                })
                                .join("")}
                        </div>
                    </div>`;
            })
            .join("");

        return `
            <div class="sd-chapter-quiz" data-quiz-id="${quiz.Quiz_ID || ""}">
                <h4><i class="fa-solid fa-list-check"></i> ${escapeHtml(quiz.Quiz_Title || "Chapter Quiz")}</h4>
                <p class="sd-quiz-instruction">
                    ${
                        isFinal
                            ? "Answer all questions and submit to finish the course. Marks are saved to the database only after this final quiz."
                            : "Answer all questions, then submit to unlock the next chapter. Marks stay local until you finish the final chapter."
                    }
                </p>
                <form class="sd-quiz-form" data-chapter-id="${ch.Chapter_ID}" data-quiz-id="${quiz.Quiz_ID || ""}">
                    ${questionsHtml}
                    <div class="sd-quiz-actions">
                        <button type="submit" class="sd-btn sd-btn-submit-quiz">
                            <i class="fa-solid fa-paper-plane"></i> Submit Quiz
                        </button>
                        <p class="sd-quiz-result" hidden></p>
                    </div>
                </form>
            </div>`;
    }

    function renderChapterStepper(course) {
        const chaptersEl = document.getElementById("sd-course-view-chapters");
        if (!chaptersEl || !course) return;

        const chapters = getSortedChapters(course);
        const progress = loadChapterProgress(course.Course_ID);
        activeCourseView = { course, chapters, progress };

        if (!chapters.length) {
            chaptersEl.innerHTML = `<p class="sd-inline-empty">No chapters published for this course yet.</p>`;
            return;
        }

        const activeIndex = firstUnlockedIncompleteIndex(chapters, progress);
        const allDone =
            chapters.length > 0 &&
            chapters.every((ch) => isChapterComplete(progress, ch.Chapter_ID));

        chaptersEl.innerHTML = `
            <p class="sd-chapter-progress-note">
                Complete each chapter quiz to unlock the next one. Database save happens only after the final chapter quiz.
                ${
                    progress.dbSynced
                        ? ' <span class="sd-chip sd-chip-enrolled">Course results saved</span>'
                        : ""
                }
            </p>
            <div class="sd-chapter-stepper" id="sd-chapter-stepper">
                ${chapters
                    .map((ch, index) => {
                        const unlocked = isChapterUnlocked(chapters, progress, index);
                        const completed = isChapterComplete(progress, ch.Chapter_ID);
                        const isFinal = isFinalChapterIndex(chapters, index);
                        const isOpen = unlocked && (allDone ? isFinal : index === activeIndex);
                        const statusLabel = completed
                            ? isFinal
                                ? "Course completed"
                                : "Completed"
                            : unlocked
                              ? "In progress"
                              : "Locked";
                        const statusIcon = completed
                            ? "fa-circle-check"
                            : unlocked
                              ? "fa-unlock"
                              : "fa-lock";

                        let completedQuizHtml = `
                            <div class="sd-chapter-quiz">
                                <p class="sd-quiz-result is-success">
                                    <i class="fa-solid fa-circle-check"></i>
                                    ${
                                        isFinal
                                            ? progress.dbSynced
                                                ? "Final quiz completed. All chapter marks were saved for risk prediction."
                                                : "Final quiz completed locally. Database save pending."
                                            : "Chapter quiz completed. Next chapter is unlocked (marks kept locally)."
                                    }
                                </p>
                                ${
                                    isFinal && !progress.dbSynced
                                        ? `<button type="button" class="sd-btn sd-btn-submit-quiz sd-btn-retry-save" data-course-id="${course.Course_ID}">
                                                <i class="fa-solid fa-cloud-arrow-up"></i> Save Results to Database
                                           </button>`
                                        : ""
                                }
                            </div>`;

                        return `
                            <article
                                class="sd-chapter-card sd-chapter-step ${completed ? "is-completed" : ""} ${
                                    unlocked ? "is-unlocked" : "is-locked"
                                } ${isOpen ? "is-open" : ""}"
                                data-chapter-id="${ch.Chapter_ID}"
                                data-chapter-index="${index}"
                                data-unlocked="${unlocked ? "true" : "false"}"
                            >
                                <button type="button" class="sd-chapter-toggle" ${unlocked ? "" : "disabled"} aria-expanded="${
                                    isOpen ? "true" : "false"
                                }">
                                    <span class="sd-chapter-header">
                                        <span class="sd-chapter-num">${escapeHtml(
                                            String(ch.Chapter_Number || index + 1)
                                        )}</span>
                                        <span class="sd-chapter-toggle-text">
                                            <h4>${escapeHtml(ch.Chapter_Title || `Chapter ${index + 1}`)}</h4>
                                            <small class="sd-chapter-status">
                                                <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
                                            </small>
                                        </span>
                                    </span>
                                    <i class="fa-solid fa-chevron-down sd-chapter-chevron"></i>
                                </button>
                                <div class="sd-chapter-panel" ${isOpen ? "" : "hidden"}>
                                    ${
                                        unlocked
                                            ? `${buildChapterMediaHtml(ch)}${
                                                  completed
                                                      ? completedQuizHtml
                                                      : buildInteractiveQuizHtml(ch, isFinal)
                                              }`
                                            : `<div class="sd-chapter-locked-msg">
                                                    <i class="fa-solid fa-lock"></i>
                                                    <p>Complete the previous chapter quiz to unlock this chapter.</p>
                                               </div>`
                                    }
                                </div>
                            </article>`;
                    })
                    .join("")}
            </div>`;

        bindChapterStepperEvents(chaptersEl, course);
        const openStep = chaptersEl.querySelector(".sd-chapter-step.is-open");
        if (openStep) {
            startChapterTimer(openStep.dataset.chapterId);
            activateChapterVideos(openStep);
        }
    }

    function activateChapterVideos(stepEl) {
        if (!stepEl) return;
        stepEl.querySelectorAll(".sd-video-wrap iframe").forEach((iframe) => {
            const src = iframe.getAttribute("data-src");
            if (src && !iframe.getAttribute("src")) {
                iframe.setAttribute("src", src);
            }
        });
    }

    function openChapterStep(stepEl) {
        const stepper = document.getElementById("sd-chapter-stepper");
        if (!stepper || !stepEl || stepEl.dataset.unlocked !== "true") return;

        stopChapterVideos(stepper);
        stepper.querySelectorAll(".sd-chapter-step").forEach((step) => {
            const isTarget = step === stepEl;
            step.classList.toggle("is-open", isTarget);
            const panel = step.querySelector(".sd-chapter-panel");
            const toggle = step.querySelector(".sd-chapter-toggle");
            if (panel) panel.hidden = !isTarget;
            if (toggle) toggle.setAttribute("aria-expanded", isTarget ? "true" : "false");
        });
        startChapterTimer(stepEl.dataset.chapterId);
        activateChapterVideos(stepEl);
        stepEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function bindChapterStepperEvents(chaptersEl, course) {
        chaptersEl.querySelectorAll(".sd-chapter-toggle").forEach((btn) => {
            btn.addEventListener("click", () => {
                const step = btn.closest(".sd-chapter-step");
                if (!step || step.dataset.unlocked !== "true") return;
                if (step.classList.contains("is-open")) {
                    // Keep one chapter focused; collapse only if already open and user toggles
                    const panel = step.querySelector(".sd-chapter-panel");
                    if (panel) {
                        const willHide = !panel.hidden;
                        if (willHide) stopChapterVideos(step);
                        panel.hidden = willHide;
                        step.classList.toggle("is-open", !willHide);
                        btn.setAttribute("aria-expanded", willHide ? "false" : "true");
                        if (!willHide) {
                            startChapterTimer(step.dataset.chapterId);
                            activateChapterVideos(step);
                        }
                    }
                    return;
                }
                openChapterStep(step);
            });
        });

        chaptersEl.querySelectorAll(".sd-btn-complete-chapter").forEach((btn) => {
            btn.addEventListener("click", () => {
                const chapterId = Number(btn.dataset.chapterId);
                finalizeChapterProgress(course, chapterId, null);
            });
        });

        chaptersEl.querySelectorAll(".sd-btn-retry-save").forEach((btn) => {
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
                try {
                    const saveResult = await persistFinalCourseActivities(course);
                    const saved = saveResult && saveResult.saved_count != null ? saveResult.saved_count : 0;
                    alert(`Saved ${saved} chapter quiz record(s) to the database.`);
                    renderChapterStepper(course);
                } catch (err) {
                    console.error(err);
                    alert(`❌ ${err.message}`);
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Save Results to Database`;
                }
            });
        });

        chaptersEl.querySelectorAll(".sd-quiz-form").forEach((form) => {
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                handleQuizSubmit(form, course);
            });
        });
    }

    function scoreQuizForm(form) {
        const questions = Array.from(form.querySelectorAll(".sd-quiz-question"));
        let unanswered = 0;
        let correct = 0;

        questions.forEach((qEl) => {
            const selected = qEl.querySelector('input[type="radio"]:checked');
            const expected = String(qEl.dataset.correct || "").trim().toUpperCase();
            qEl.classList.remove("is-correct", "is-wrong", "is-unanswered");

            if (!selected) {
                unanswered += 1;
                qEl.classList.add("is-unanswered");
                return;
            }

            if (String(selected.value).trim().toUpperCase() === expected) {
                correct += 1;
                qEl.classList.add("is-correct");
            } else {
                qEl.classList.add("is-wrong");
            }
        });

        const total = questions.length;
        const percent = total ? Math.round((correct / total) * 100) : 0;
        return { questions, unanswered, correct, total, percent, passed: total === 0 || percent >= 50 };
    }

    function buildActivitiesPayload(course, progress) {
        const chapters = getSortedChapters(course);
        const activities = [];

        chapters.forEach((ch) => {
            const quiz = ch.quiz;
            if (!quiz || !quiz.Quiz_ID) return;
            const local = progress.quizResults[String(ch.Chapter_ID)];
            if (!local) return;
            activities.push({
                Quiz_ID: Number(local.Quiz_ID || quiz.Quiz_ID),
                Marks_Obtained: Number(local.Marks_Obtained),
                Time_Spent_Minutes: Number(local.Time_Spent_Minutes || 1),
                Attendance_Percentage: Number(local.Attendance_Percentage || 100),
            });
        });

        return {
            Course_ID: course.Course_ID,
            activities,
        };
    }

    async function persistFinalCourseActivities(course) {
        const progress = loadChapterProgress(course.Course_ID);
        if (progress.dbSynced) {
            return { alreadySaved: true, saved_count: 0 };
        }

        const payload = buildActivitiesPayload(course, progress);
        if (!payload.activities.length) {
            progress.dbSynced = true;
            saveChapterProgress(course.Course_ID, progress);
            return { alreadySaved: false, saved_count: 0, skipped: true };
        }

        const data = await apiJson(`${API_BASE_URL}/student/complete-course-activities`, {
            method: "POST",
            body: JSON.stringify(payload),
        });

        progress.dbSynced = true;
        saveChapterProgress(course.Course_ID, progress);
        return data;
    }

    async function finalizeChapterProgress(course, chapterId, quizResult) {
        const chapters = getSortedChapters(course);
        const index = getChapterIndex(chapters, chapterId);
        const isFinal = isFinalChapterIndex(chapters, index);

        if (quizResult) {
            storeLocalQuizResult(course.Course_ID, chapterId, quizResult);
        }

        markChapterComplete(course.Course_ID, chapterId);

        if (!isFinal) {
            alert(
                quizResult
                    ? `Quiz completed (${quizResult.correct}/${quizResult.total}). Next chapter unlocked. Marks kept locally until the final chapter.`
                    : "Chapter marked complete. Next chapter unlocked."
            );
            renderChapterStepper(course);
            return;
        }

        // FINAL chapter — mark course finished for the Finished Courses table
        markCourseFinished(course.Course_ID);

        // FINAL chapter only — send ALL aggregated chapter activities to student_activity
        try {
            const saveResult = await persistFinalCourseActivities(course);
            const saved = saveResult && saveResult.saved_count != null ? saveResult.saved_count : 0;
            if (saveResult && saveResult.skipped) {
                alert("Course completed. No quiz marks to save.");
            } else if (saveResult && saveResult.alreadySaved) {
                alert("Course already completed. Results were previously saved.");
            } else {
                alert(
                    `Course completed! ${saved} chapter quiz record(s) saved to the database for risk prediction.`
                );
            }
        } catch (err) {
            console.error(err);
            alert(
                `Final quiz completed locally, but saving marks failed: ${err.message}\nUse "Save Results to Database" to retry.`
            );
        }

        renderChapterStepper(course);
        loadFinishedCourses({ silent: true });
        loadMyCourses({ silent: true });
        loadCourseResults({ silent: true });
    }

    async function handleQuizSubmit(form, course) {
        const chapterId = Number(form.dataset.chapterId);
        const quizId = Number(form.dataset.quizId);
        const resultEl = form.querySelector(".sd-quiz-result");
        const scored = scoreQuizForm(form);

        if (!scored.total) {
            await finalizeChapterProgress(course, chapterId, null);
            return;
        }

        if (scored.unanswered > 0) {
            if (resultEl) {
                resultEl.hidden = false;
                resultEl.className = "sd-quiz-result is-error";
                resultEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Please answer all ${scored.total} questions before submitting.`;
            }
            return;
        }

        if (resultEl) {
            resultEl.hidden = false;
            resultEl.className = `sd-quiz-result ${scored.passed ? "is-success" : "is-error"}`;
            resultEl.innerHTML = scored.passed
                ? `<i class="fa-solid fa-circle-check"></i> Quiz submitted: ${scored.correct}/${scored.total} correct (${scored.percent}%).`
                : `<i class="fa-solid fa-circle-exclamation"></i> Score ${scored.correct}/${scored.total} (${scored.percent}%). You need at least 50% to continue. Try again.`;
        }

        if (!scored.passed) return;

        form.querySelectorAll("input[type='radio']").forEach((input) => {
            input.disabled = true;
        });
        const submitBtn = form.querySelector(".sd-btn-submit-quiz");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        }

        const quizResult = {
            Quiz_ID: quizId,
            Chapter_ID: chapterId,
            correct: scored.correct,
            total: scored.total,
            Marks_Obtained: scored.percent,
            Time_Spent_Minutes: getChapterTimeSpentMinutes(chapterId),
            Attendance_Percentage: 100,
        };

        // Chapters 1..n-1: local only. Final chapter: aggregate + DB save inside finalize.
        await finalizeChapterProgress(course, chapterId, quizResult);
    }

    function ensureStudentCourseOverlay() {
        let overlay = document.getElementById("sd-course-view-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "sd-course-view-overlay";
            overlay.className = "sd-fullpage-overlay";
            overlay.setAttribute("aria-hidden", "true");
            overlay.innerHTML = `
                <div class="sd-fullpage-shell" role="dialog" aria-modal="true" aria-labelledby="sd-course-view-title">
                    <header class="sd-fullpage-header">
                        <button type="button" class="sd-btn sd-btn-nav" id="sd-course-view-close">
                            <i class="fa-solid fa-arrow-left"></i> Back to My Courses
                        </button>
                        <div class="sd-fullpage-meta">
                            <span class="sd-chip" id="sd-course-view-teacher">Teacher</span>
                            <span class="sd-chip sd-chip-price" id="sd-course-view-price">LKR 0.00</span>
                        </div>
                    </header>
                    <div class="sd-fullpage-hero">
                        <p class="sd-fullpage-kicker">Enrolled Course</p>
                        <h2 id="sd-course-view-title">Course Title</h2>
                        <p id="sd-course-view-description" class="sd-fullpage-description"></p>
                    </div>
                    <div class="sd-fullpage-content">
                        <h3 class="sd-fullpage-section-title"><i class="fa-solid fa-book-open"></i> Chapters</h3>
                        <div id="sd-course-view-chapters" class="sd-chapters-list"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        if (!overlay.dataset.wired) {
            overlay.dataset.wired = "true";
            const closeBtn = document.getElementById("sd-course-view-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", closeEnrolledCourseView);
            }
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeEnrolledCourseView();
            });
        }

        return overlay;
    }

    function closeEnrolledCourseView() {
        const overlay = document.getElementById("sd-course-view-overlay");
        if (!overlay) return;
        stopChapterVideos(overlay);
        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("sd-overlay-open");
        activeCourseView = null;
    }

    function openEnrolledCourseView(course) {
        if (!course) return;
        const overlay = ensureStudentCourseOverlay();
        const titleEl = document.getElementById("sd-course-view-title");
        const descEl = document.getElementById("sd-course-view-description");
        const teacherEl = document.getElementById("sd-course-view-teacher");
        const priceEl = document.getElementById("sd-course-view-price");

        if (titleEl) titleEl.textContent = course.Title || "Untitled Course";
        if (descEl) {
            descEl.textContent =
                (course.Description && String(course.Description).trim()) || "No description provided.";
        }
        if (teacherEl) {
            teacherEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> ${escapeHtml(
                course.Teacher_Name || "Unknown Teacher"
            )}`;
        }
        if (priceEl) priceEl.textContent = formatPrice(course.Price);

        ensureCourseStartedAt(course.Course_ID, course.Enrollment_Date || null);
        renderChapterStepper(course);

        overlay.classList.add("is-open");
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("sd-overlay-open");
    }

    // Expose for future student feature modules without breaking current bindings
    window.LearnifyStudentDashboard = {
        API_BASE_URL,
        token,
        userName: displayName,
        userEmail: displayEmail,
        getAuthHeaders,
        loadAvailableCourses,
        loadMyCourses,
        loadFinishedCourses,
        loadCourseResults,
        closeEnrolledCourseView,
    };

    // Initial data load for default Courses tab
    loadAvailableCourses();
    loadMyCourses({ silent: true });

    console.log("✅ Student Dashboard initialized successfully!");
});
