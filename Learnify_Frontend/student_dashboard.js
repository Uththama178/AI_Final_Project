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
                container.appendChild(createMyCourseCard(course));
            });
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
    // Enrolled course content overlay
    // ------------------------------------------
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
        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("sd-overlay-open");
    }

    function openEnrolledCourseView(course) {
        if (!course) return;
        const overlay = ensureStudentCourseOverlay();
        const titleEl = document.getElementById("sd-course-view-title");
        const descEl = document.getElementById("sd-course-view-description");
        const teacherEl = document.getElementById("sd-course-view-teacher");
        const priceEl = document.getElementById("sd-course-view-price");
        const chaptersEl = document.getElementById("sd-course-view-chapters");

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

        const chapters = Array.isArray(course.chapters) ? course.chapters : [];
        if (chaptersEl) {
            if (!chapters.length) {
                chaptersEl.innerHTML = `<p class="sd-inline-empty">No chapters published for this course yet.</p>`;
            } else {
                chaptersEl.innerHTML = chapters
                    .slice()
                    .sort((a, b) => (a.Chapter_Number || 0) - (b.Chapter_Number || 0))
                    .map((ch) => {
                        const videoEmbed = toYouTubeEmbed(ch.Video_Link_Or_Path);
                        const pdfUrl = buildPdfUrl(ch.PDF_Link_Or_Path);
                        const quiz = ch.quiz;
                        const questions = quiz && Array.isArray(quiz.questions) ? quiz.questions : [];

                        let mediaHtml = `<div class="sd-chapter-media">`;
                        if (videoEmbed) {
                            mediaHtml += `
                                <div class="sd-video-wrap">
                                    <iframe src="${escapeHtml(videoEmbed)}" title="Chapter video"
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

                        let quizHtml = "";
                        if (quiz) {
                            quizHtml = `
                                <div class="sd-chapter-quiz">
                                    <h4><i class="fa-solid fa-list-check"></i> ${escapeHtml(
                                        quiz.Quiz_Title || "Chapter Quiz"
                                    )}</h4>
                                    ${
                                        questions.length
                                            ? questions
                                                  .map(
                                                      (q, idx) => `
                                        <div class="sd-quiz-question">
                                            <p class="sd-q-text"><strong>Q${idx + 1}.</strong> ${escapeHtml(
                                                          q.Question_Text || ""
                                                      )}</p>
                                            <ul class="sd-q-options">
                                                <li>A. ${escapeHtml(q.Option_A || "")}</li>
                                                <li>B. ${escapeHtml(q.Option_B || "")}</li>
                                                <li>C. ${escapeHtml(q.Option_C || "")}</li>
                                                <li>D. ${escapeHtml(q.Option_D || "")}</li>
                                            </ul>
                                        </div>`
                                                  )
                                                  .join("")
                                            : `<p class="sd-media-note muted">No questions in this quiz yet.</p>`
                                    }
                                </div>`;
                        }

                        return `
                            <article class="sd-chapter-card">
                                <header class="sd-chapter-header">
                                    <span class="sd-chapter-num">${escapeHtml(String(ch.Chapter_Number || ""))}</span>
                                    <h4>${escapeHtml(ch.Chapter_Title || "Chapter")}</h4>
                                </header>
                                ${mediaHtml}
                                ${quizHtml}
                            </article>`;
                    })
                    .join("");
            }
        }

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
        closeEnrolledCourseView,
    };

    // Initial data load for default Courses tab
    loadAvailableCourses();
    loadMyCourses({ silent: true });

    console.log("✅ Student Dashboard initialized successfully!");
});
