/**
 * Teacher "My Courses" card rendering module.
 * Loads modal/templates from course_cards_component.html (no modal HTML in dashboard).
 */
(function () {
    "use strict";

    const API_BASE_URL = "http://127.0.0.1:8000";
    const COMPONENT_URL = "course_cards_component.html";

    let componentsReady = false;
    let detailsCache = {};

    function getToken() {
        return localStorage.getItem("access_token");
    }

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
        const raw = String(url).trim();
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        ];
        for (const re of patterns) {
            const m = raw.match(re);
            if (m && m[1]) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`;
        }
        return null;
    }

    async function ensureCourseCardComponentsLoaded() {
        if (componentsReady && document.getElementById("tc-edit-course-modal")) {
            return true;
        }

        if (document.getElementById("tc-edit-course-modal") && document.getElementById("tc-video-modal")) {
            componentsReady = true;
            wireModalChrome();
            return true;
        }

        try {
            const response = await fetch(COMPONENT_URL, { cache: "no-cache" });
            if (!response.ok) {
                throw new Error(`Failed to load ${COMPONENT_URL} (${response.status})`);
            }
            const html = await response.text();
            const wrap = document.createElement("div");
            wrap.id = "tc-course-cards-component-root";
            wrap.innerHTML = html;
            document.body.appendChild(wrap);
            componentsReady = true;
            wireModalChrome();
            return true;
        } catch (err) {
            console.error("Course cards component load error:", err);
            return false;
        }
    }

    function wireModalChrome() {
        document.querySelectorAll("[data-tc-close]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const which = btn.getAttribute("data-tc-close");
                if (which === "edit") closeEditCourseModal();
                if (which === "video") closeVideoModal();
            });
        });

        const editOverlay = document.getElementById("tc-edit-course-modal");
        const videoOverlay = document.getElementById("tc-video-modal");

        if (editOverlay) {
            editOverlay.addEventListener("click", (e) => {
                if (e.target === editOverlay) closeEditCourseModal();
            });
        }
        if (videoOverlay) {
            videoOverlay.addEventListener("click", (e) => {
                if (e.target === videoOverlay) closeVideoModal();
            });
        }

        const form = document.getElementById("tc-edit-course-form");
        if (form && !form.dataset.wired) {
            form.dataset.wired = "1";
            form.addEventListener("submit", submitEditCourseForm);
        }
    }

    function openVideoModal(videoUrl, title) {
        const overlay = document.getElementById("tc-video-modal");
        const container = document.getElementById("tc-video-player-container");
        const titleEl = document.getElementById("tc-video-modal-title");
        if (!overlay || !container) return;

        if (titleEl) {
            titleEl.innerHTML = `<i class="fa-solid fa-circle-play"></i> ${escapeHtml(title || "Lecture Preview")}`;
        }

        const embed = toYouTubeEmbed(videoUrl);
        container.innerHTML = "";
        if (embed) {
            const iframe = document.createElement("iframe");
            iframe.src = embed;
            iframe.allow =
                "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
            iframe.allowFullscreen = true;
            iframe.title = "Lecture video";
            container.appendChild(iframe);
        } else if (videoUrl) {
            const video = document.createElement("video");
            video.src = videoUrl;
            video.controls = true;
            video.autoplay = true;
            container.appendChild(video);
        } else {
            container.innerHTML = `<p class="tc-details-error">No video URL available for this chapter.</p>`;
        }

        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
    }

    function closeVideoModal() {
        const overlay = document.getElementById("tc-video-modal");
        const container = document.getElementById("tc-video-player-container");
        if (container) container.innerHTML = "";
        if (overlay) {
            overlay.classList.remove("open");
            overlay.setAttribute("aria-hidden", "true");
        }
    }

    function openEditCourseModal(course) {
        const overlay = document.getElementById("tc-edit-course-modal");
        if (!overlay || !course) return;

        document.getElementById("tc-edit-course-id").value = course.Course_ID;
        document.getElementById("tc-edit-title").value = course.Title || "";
        document.getElementById("tc-edit-description").value = course.Description || "";
        document.getElementById("tc-edit-price").value =
            course.Price !== undefined && course.Price !== null ? Number(course.Price) : 0;

        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
    }

    function closeEditCourseModal() {
        const overlay = document.getElementById("tc-edit-course-modal");
        if (overlay) {
            overlay.classList.remove("open");
            overlay.setAttribute("aria-hidden", "true");
        }
    }

    async function submitEditCourseForm(e) {
        e.preventDefault();
        const token = getToken();
        const courseId = document.getElementById("tc-edit-course-id").value;
        const title = document.getElementById("tc-edit-title").value.trim();
        const description = document.getElementById("tc-edit-description").value.trim();
        const price = parseFloat(document.getElementById("tc-edit-price").value);
        const saveBtn = document.getElementById("tc-edit-save-btn");

        if (!courseId || !title || Number.isNaN(price) || price < 0) {
            alert("Please enter a valid Title and non-negative Price.");
            return;
        }

        const original = saveBtn ? saveBtn.innerHTML : "";
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/teacher/update-course/${courseId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    Title: title,
                    Description: description,
                    Price: price,
                }),
            });

            if (!response.ok) {
                let detail = `Update failed (${response.status})`;
                try {
                    const err = await response.json();
                    detail = err.detail || detail;
                } catch (_) {}
                throw new Error(detail);
            }

            delete detailsCache[courseId];
            closeEditCourseModal();
            alert("Course info updated successfully!");
            await fetchAndRenderTeacherCourses();
        } catch (err) {
            console.error(err);
            alert(`❌ ${err.message}`);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = original;
            }
        }
    }

    function renderInteractiveQuiz(quiz, chapterId) {
        if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
            return `<p class="tc-details-loading"><i class="fa-solid fa-circle-info"></i> No quiz questions for this chapter.</p>`;
        }

        const title = escapeHtml(quiz.Quiz_Title || "Chapter Quiz");
        let html = `<h5><i class="fa-solid fa-list-check"></i> ${title} <span style="font-weight:500;color:rgba(10,25,49,0.5);">(Preview Mode)</span></h5>`;

        quiz.questions.forEach((q, index) => {
            const qid = q.Question_ID || `${chapterId}-q${index}`;
            const name = `tc-quiz-${chapterId}-${qid}`;
            const correct = String(q.Correct_Answer || "A").toUpperCase().trim();
            const options = [
                ["A", q.Option_A],
                ["B", q.Option_B],
                ["C", q.Option_C],
                ["D", q.Option_D],
            ];

            html += `<div class="tc-mcq-item" data-correct="${escapeHtml(correct)}">`;
            html += `<p class="tc-mcq-qtext">${index + 1}. ${escapeHtml(q.Question_Text || "")}</p>`;
            html += `<div class="tc-mcq-options">`;
            options.forEach(([letter, text]) => {
                html += `
                    <label class="tc-mcq-option">
                        <input type="radio" name="${name}" value="${letter}">
                        <span><strong>${letter}.</strong> ${escapeHtml(text || "")}</span>
                    </label>`;
            });
            html += `</div><div class="tc-mcq-feedback" hidden></div></div>`;
        });

        return html;
    }

    function bindQuizInteractions(root) {
        root.querySelectorAll(".tc-mcq-item").forEach((item) => {
            const correct = (item.getAttribute("data-correct") || "A").toUpperCase();
            const feedback = item.querySelector(".tc-mcq-feedback");
            item.querySelectorAll(".tc-mcq-option input").forEach((input) => {
                input.addEventListener("change", () => {
                    item.querySelectorAll(".tc-mcq-option").forEach((opt) => {
                        opt.classList.remove("selected", "correct", "wrong");
                    });
                    const label = input.closest(".tc-mcq-option");
                    if (!label) return;
                    label.classList.add("selected");
                    const chosen = input.value.toUpperCase();
                    if (chosen === correct) {
                        label.classList.add("correct");
                        if (feedback) {
                            feedback.hidden = false;
                            feedback.style.color = "#27ae60";
                            feedback.textContent = "Correct answer selected.";
                        }
                    } else {
                        label.classList.add("wrong");
                        item.querySelectorAll(".tc-mcq-option").forEach((opt) => {
                            const optInput = opt.querySelector("input");
                            if (optInput && optInput.value.toUpperCase() === correct) {
                                opt.classList.add("correct");
                            }
                        });
                        if (feedback) {
                            feedback.hidden = false;
                            feedback.style.color = "#c0392b";
                            feedback.textContent = `Incorrect. Correct answer is ${correct}.`;
                        }
                    }
                });
            });
        });
    }

    function buildChapterDetailsHtml(chapters) {
        if (!chapters || chapters.length === 0) {
            return `<p class="tc-details-loading">No chapters found for this course.</p>`;
        }

        const sorted = [...chapters].sort(
            (a, b) => (a.Chapter_Number || 0) - (b.Chapter_Number || 0)
        );

        return sorted
            .map((ch) => {
                const num = ch.Chapter_Number || 0;
                const videoUrl = ch.Video_Link_Or_Path || "";
                const pdfUrl = buildPdfUrl(ch.PDF_Link_Or_Path);
                const quizHtml = renderInteractiveQuiz(ch.quiz, ch.Chapter_ID);

                return `
                <div class="tc-chapter-accordion" data-chapter-id="${ch.Chapter_ID}">
                    <button type="button" class="tc-chapter-header">
                        <span class="tc-chapter-header-left">
                            <span class="tc-chapter-num">${num}</span>
                            <span class="tc-chapter-title">${escapeHtml(ch.Chapter_Title || `Chapter ${num}`)}</span>
                        </span>
                        <i class="fa-solid fa-chevron-down tc-chapter-chevron"></i>
                    </button>
                    <div class="tc-chapter-body">
                        <div class="tc-media-row">
                            ${
                                videoUrl
                                    ? `<button type="button" class="tc-btn tc-btn-sm tc-btn-play tc-open-video" data-video-url="${escapeHtml(videoUrl)}" data-video-title="${escapeHtml(ch.Chapter_Title || "Lecture")}">
                                        <i class="fa-solid fa-play"></i> Watch Lecture
                                       </button>`
                                    : `<span class="tc-details-loading">No video linked</span>`
                            }
                            ${
                                pdfUrl
                                    ? `<a class="tc-btn tc-btn-sm tc-btn-pdf" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">
                                        <i class="fa-solid fa-file-pdf"></i> Open PDF
                                       </a>`
                                    : `<span class="tc-details-loading">No PDF linked</span>`
                            }
                        </div>
                        <div class="tc-quiz-block">${quizHtml}</div>
                    </div>
                </div>`;
            })
            .join("");
    }

    function bindDetailsPanelEvents(panel) {
        panel.querySelectorAll(".tc-chapter-header").forEach((btn) => {
            btn.addEventListener("click", () => {
                const accordion = btn.closest(".tc-chapter-accordion");
                if (accordion) accordion.classList.toggle("open");
            });
        });

        panel.querySelectorAll(".tc-open-video").forEach((btn) => {
            btn.addEventListener("click", () => {
                openVideoModal(btn.getAttribute("data-video-url"), btn.getAttribute("data-video-title"));
            });
        });

        bindQuizInteractions(panel);
    }

    async function toggleCourseDetails(card, courseId, expandBtn) {
        const panel = card.querySelector(".tc-details-panel");
        if (!panel) return;

        const isOpen = panel.classList.contains("open");
        if (isOpen) {
            panel.classList.remove("open");
            panel.hidden = true;
            if (expandBtn) {
                expandBtn.innerHTML = `<i class="fa-solid fa-chevron-down"></i> View Details`;
            }
            return;
        }

        panel.hidden = false;
        panel.classList.add("open");
        panel.innerHTML = `<p class="tc-details-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading course details...</p>`;
        if (expandBtn) {
            expandBtn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Hide Details`;
        }

        try {
            let detail = detailsCache[courseId];
            if (!detail) {
                const token = getToken();
                const response = await fetch(`${API_BASE_URL}/teacher/course-details/${courseId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!response.ok) {
                    let detailMsg = `Failed to load details (${response.status})`;
                    try {
                        const err = await response.json();
                        detailMsg = err.detail || detailMsg;
                    } catch (_) {}
                    throw new Error(detailMsg);
                }
                detail = await response.json();
                detailsCache[courseId] = detail;
            }

            panel.innerHTML = buildChapterDetailsHtml(detail.chapters || []);
            bindDetailsPanelEvents(panel);

            const first = panel.querySelector(".tc-chapter-accordion");
            if (first) first.classList.add("open");
        } catch (err) {
            console.error(err);
            panel.innerHTML = `<p class="tc-details-error"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(err.message)}</p>`;
        }
    }

    function createCourseCard(course) {
        const card = document.createElement("article");
        card.className = "tc-course-card";
        card.dataset.courseId = course.Course_ID;

        const chapterLabel =
            course.chapter_count === 1 ? "1 Chapter" : `${course.chapter_count || 0} Chapters`;
        const desc = course.Description && String(course.Description).trim()
            ? course.Description
            : "No description provided.";

        card.innerHTML = `
            <div class="tc-course-card-accent"></div>
            <div class="tc-course-card-body">
                <div class="tc-course-card-top">
                    <span class="tc-chapter-count">
                        <i class="fa-solid fa-layer-group"></i>
                        <span class="tc-chapter-count-value">${escapeHtml(chapterLabel)}</span>
                    </span>
                    <span class="tc-price-badge">${escapeHtml(formatPrice(course.Price))}</span>
                </div>
                <h4 class="tc-course-title">${escapeHtml(course.Title || "Untitled Course")}</h4>
                <p class="tc-course-desc">${escapeHtml(desc)}</p>
                <div class="tc-card-actions">
                    <button type="button" class="tc-btn tc-btn-secondary tc-btn-edit-info">
                        <i class="fa-solid fa-pen"></i> Edit Info
                    </button>
                    <button type="button" class="tc-btn tc-btn-primary tc-btn-view-details">
                        <i class="fa-solid fa-chevron-down"></i> View Details
                    </button>
                </div>
            </div>
            <div class="tc-details-panel" hidden></div>
        `;

        const editBtn = card.querySelector(".tc-btn-edit-info");
        const viewBtn = card.querySelector(".tc-btn-view-details");

        if (editBtn) {
            editBtn.addEventListener("click", () => openEditCourseModal(course));
        }
        if (viewBtn) {
            viewBtn.addEventListener("click", () =>
                toggleCourseDetails(card, course.Course_ID, viewBtn)
            );
        }

        return card;
    }

    async function fetchAndRenderTeacherCourses() {
        const container = document.getElementById("uploaded-courses-container");
        if (!container) return;

        await ensureCourseCardComponentsLoaded();

        const token = getToken();
        if (!token) {
            container.innerHTML = `
                <div class="tc-empty-state">
                    <i class="fa-solid fa-user-lock"></i>
                    <p>Please log in again to view your courses.</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="tc-empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Loading your launched courses...</p>
            </div>`;

        try {
            const response = await fetch(`${API_BASE_URL}/teacher/my-courses`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                let detail = `Could not load courses (${response.status})`;
                try {
                    const err = await response.json();
                    detail = err.detail || detail;
                } catch (_) {}
                throw new Error(detail);
            }

            const courses = await response.json();
            container.innerHTML = "";

            if (!Array.isArray(courses) || courses.length === 0) {
                container.innerHTML = `
                    <div class="tc-empty-state">
                        <i class="fa-solid fa-box-open"></i>
                        <p>No courses uploaded yet. Use the "Create Course" tab to launch your first course!</p>
                    </div>`;
                return;
            }

            courses.forEach((course) => {
                container.appendChild(createCourseCard(course));
            });
        } catch (err) {
            console.error(err);
            container.innerHTML = `
                <div class="tc-empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>${escapeHtml(err.message)}</p>
                </div>`;
        }
    }

    function bindMyCoursesTabTrigger() {
        document.querySelectorAll('.sidebar-menu .menu-item[data-tab="my-courses"]').forEach((item) => {
            item.addEventListener("click", () => {
                fetchAndRenderTeacherCourses();
            });
        });
    }

    document.addEventListener("DOMContentLoaded", async () => {
        await ensureCourseCardComponentsLoaded();
        bindMyCoursesTabTrigger();

        const myCoursesTab = document.getElementById("my-courses");
        if (myCoursesTab && myCoursesTab.classList.contains("active")) {
            await fetchAndRenderTeacherCourses();
        }
    });

    // Expose for manual refresh / debugging
    window.fetchAndRenderTeacherCourses = fetchAndRenderTeacherCourses;
    window.openEditCourseModal = openEditCourseModal;
})();
