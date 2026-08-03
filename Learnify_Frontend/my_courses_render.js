/**
 * Teacher "My Courses" card rendering module.
 * Loads modal/templates from course_cards_component.html (no modal HTML in dashboard).
 * Course details + quizzes open as full-page overlays (not inline card expansion).
 */
(function () {
    "use strict";

    const API_BASE_URL = "http://127.0.0.1:8000";
    const COMPONENT_URL = "course_cards_component.html";

    let componentsReady = false;
    let detailsCache = {};
    let activeCourseDetail = null;

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
        let raw = String(url).trim();
        // Decode common HTML-entity / escaped forms from attributes
        raw = raw
            .replace(/&amp;/gi, "&")
            .replace(/&#38;/g, "&")
            .replace(/&quot;/gi, '"');

        // Extract 11-char YouTube video ID from common URL shapes
        const patterns = [
            /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/,
        ];
        for (const re of patterns) {
            const m = raw.match(re);
            if (m && m[1]) {
                return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`;
            }
        }
        return null;
    }

    function getYoutubeIframe() {
        return document.getElementById("tc-youtube-iframe");
    }

    function clearVideoPlayer() {
        const iframe = getYoutubeIframe();
        const container = document.getElementById("tc-video-player-container");
        const errEl = document.getElementById("tc-video-error");
        if (iframe) {
            // Clear src so playback/audio stops immediately
            iframe.src = "about:blank";
            iframe.removeAttribute("src");
            iframe.src = "";
        }
        if (container) {
            // Remove any leftover <video> fallback nodes, keep the iframe
            container.querySelectorAll("video").forEach((v) => v.remove());
        }
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = "";
        }
    }

    async function ensureCourseCardComponentsLoaded() {
        if (componentsReady && document.getElementById("tc-edit-course-modal") && document.getElementById("tc-course-view-overlay")) {
            return true;
        }

        if (
            document.getElementById("tc-edit-course-modal") &&
            document.getElementById("tc-video-modal") &&
            document.getElementById("tc-course-view-overlay") &&
            document.getElementById("tc-quiz-view-overlay")
        ) {
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
            let wrap = document.getElementById("tc-course-cards-component-root");
            if (!wrap) {
                wrap = document.createElement("div");
                wrap.id = "tc-course-cards-component-root";
                document.body.appendChild(wrap);
            }
            wrap.innerHTML = html;
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
            if (btn.dataset.wiredClose) return;
            btn.dataset.wiredClose = "1";
            btn.addEventListener("click", () => {
                const which = btn.getAttribute("data-tc-close");
                if (which === "edit") closeEditCourseModal();
                if (which === "video") closeVideoModal();
                if (which === "course-view") closeCourseView();
                if (which === "quiz-view") closeQuizView();
            });
        });

        const editOverlay = document.getElementById("tc-edit-course-modal");
        const videoOverlay = document.getElementById("tc-video-modal");

        if (editOverlay && !editOverlay.dataset.wiredBackdrop) {
            editOverlay.dataset.wiredBackdrop = "1";
            editOverlay.addEventListener("click", (e) => {
                if (e.target === editOverlay) closeEditCourseModal();
            });
        }
        if (videoOverlay && !videoOverlay.dataset.wiredBackdrop) {
            videoOverlay.dataset.wiredBackdrop = "1";
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

    function lockBodyScroll(lock) {
        document.body.style.overflow = lock ? "hidden" : "";
    }

    function openVideoModal(videoUrl, title) {
        const overlay = document.getElementById("tc-video-modal");
        const container = document.getElementById("tc-video-player-container");
        const titleEl = document.getElementById("tc-video-modal-title");
        const errEl = document.getElementById("tc-video-error");
        let iframe = getYoutubeIframe();
        if (!overlay || !container) return;

        // Ensure modal appears above full-page course/quiz overlays
        overlay.style.zIndex = "10050";

        if (titleEl) {
            titleEl.innerHTML = `<i class="fa-solid fa-circle-play"></i> ${escapeHtml(title || "Lecture Preview")}`;
        }

        // Recreate iframe if missing (after older component HTML / hard refresh edge cases)
        if (!iframe) {
            iframe = document.createElement("iframe");
            iframe.id = "tc-youtube-iframe";
            iframe.title = "Lecture video";
            iframe.allow =
                "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
            iframe.allowFullscreen = true;
            iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            container.innerHTML = "";
            container.appendChild(iframe);
        }

        // Remove any prior non-iframe fallback players
        container.querySelectorAll("video").forEach((v) => v.remove());
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = "";
        }

        const embed = toYouTubeEmbed(videoUrl);
        if (embed) {
            iframe.style.display = "block";
            iframe.src = embed;
        } else if (videoUrl) {
            // Non-YouTube direct media fallback
            iframe.style.display = "none";
            iframe.src = "";
            const video = document.createElement("video");
            video.src = videoUrl;
            video.controls = true;
            video.autoplay = true;
            container.appendChild(video);
        } else {
            iframe.style.display = "none";
            iframe.src = "";
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = "No video URL available for this chapter.";
            }
        }

        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
    }

    function closeVideoModal() {
        const overlay = document.getElementById("tc-video-modal");
        clearVideoPlayer();
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

        let html = "";
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

            html += `<div class="tc-mcq-item tc-quiz-page-item" data-correct="${escapeHtml(correct)}">`;
            html += `<div class="tc-quiz-q-meta"><span class="tc-quiz-q-number">Question ${index + 1}</span></div>`;
            html += `<p class="tc-mcq-qtext">${escapeHtml(q.Question_Text || "")}</p>`;
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
        const items = root.querySelectorAll(".tc-mcq-item");
        const total = items.length;
        const progressFill = document.getElementById("tc-quiz-progress-fill");
        const progressLabel = document.getElementById("tc-quiz-view-progress");

        function updateProgress() {
            let answered = 0;
            items.forEach((item) => {
                if (item.querySelector(".tc-mcq-option input:checked")) answered += 1;
            });
            const pct = total ? Math.round((answered / total) * 100) : 0;
            if (progressFill) progressFill.style.width = `${pct}%`;
            if (progressLabel) progressLabel.textContent = `${answered} / ${total} answered`;
        }

        items.forEach((item) => {
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
                    updateProgress();
                });
            });
        });

        updateProgress();
    }

    function buildChapterListHtml(chapters) {
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
                const hasQuiz = ch.quiz && Array.isArray(ch.quiz.questions) && ch.quiz.questions.length > 0;

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
                        <div class="tc-chapter-actions-grid">
                            ${
                                videoUrl
                                    ? `<button type="button" class="tc-action-tile tc-open-video" data-video-url="${escapeHtml(videoUrl)}" data-video-title="${escapeHtml(ch.Chapter_Title || "Lecture")}">
                                        <span class="tc-action-icon tc-action-icon-video"><i class="fa-solid fa-circle-play"></i></span>
                                        <span class="tc-action-copy">
                                            <strong>Lecture Video</strong>
                                            <small>Open video preview</small>
                                        </span>
                                       </button>`
                                    : `<div class="tc-action-tile tc-action-tile-disabled">
                                        <span class="tc-action-icon"><i class="fa-solid fa-circle-play"></i></span>
                                        <span class="tc-action-copy"><strong>Lecture Video</strong><small>Not available</small></span>
                                       </div>`
                            }
                            ${
                                pdfUrl
                                    ? `<a class="tc-action-tile tc-action-tile-pdf" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">
                                        <span class="tc-action-icon tc-action-icon-pdf"><i class="fa-solid fa-file-pdf"></i></span>
                                        <span class="tc-action-copy">
                                            <strong>PDF Resource</strong>
                                            <small>Open / download document</small>
                                        </span>
                                       </a>`
                                    : `<div class="tc-action-tile tc-action-tile-disabled">
                                        <span class="tc-action-icon"><i class="fa-solid fa-file-pdf"></i></span>
                                        <span class="tc-action-copy"><strong>PDF Resource</strong><small>Not available</small></span>
                                       </div>`
                            }
                            ${
                                hasQuiz
                                    ? `<button type="button" class="tc-action-tile tc-action-tile-quiz tc-open-chapter-quiz" data-chapter-id="${ch.Chapter_ID}">
                                        <span class="tc-action-icon tc-action-icon-quiz"><i class="fa-solid fa-list-check"></i></span>
                                        <span class="tc-action-copy">
                                            <strong>View Chapter Quiz</strong>
                                            <small>${ch.quiz.questions.length} MCQ question(s)</small>
                                        </span>
                                       </button>`
                                    : `<div class="tc-action-tile tc-action-tile-disabled">
                                        <span class="tc-action-icon"><i class="fa-solid fa-list-check"></i></span>
                                        <span class="tc-action-copy"><strong>View Chapter Quiz</strong><small>No quiz generated</small></span>
                                       </div>`
                            }
                        </div>
                    </div>
                </div>`;
            })
            .join("");
    }

    function bindCourseViewChapterEvents(listRoot, courseDetail) {
        listRoot.querySelectorAll(".tc-chapter-header").forEach((btn) => {
            btn.addEventListener("click", () => {
                const accordion = btn.closest(".tc-chapter-accordion");
                if (!accordion) return;
                const wasOpen = accordion.classList.contains("open");
                listRoot.querySelectorAll(".tc-chapter-accordion").forEach((el) => el.classList.remove("open"));
                if (!wasOpen) accordion.classList.add("open");
            });
        });

        listRoot.querySelectorAll(".tc-open-video").forEach((btn) => {
            btn.addEventListener("click", () => {
                openVideoModal(btn.getAttribute("data-video-url"), btn.getAttribute("data-video-title"));
            });
        });

        listRoot.querySelectorAll(".tc-open-chapter-quiz").forEach((btn) => {
            btn.addEventListener("click", () => {
                const chapterId = Number(btn.getAttribute("data-chapter-id"));
                const chapter = (courseDetail.chapters || []).find((c) => c.Chapter_ID === chapterId);
                if (chapter) openQuizView(courseDetail, chapter);
            });
        });
    }

    function closeCourseView() {
        const overlay = document.getElementById("tc-course-view-overlay");
        if (overlay) {
            overlay.classList.remove("open");
            overlay.setAttribute("aria-hidden", "true");
        }
        if (!document.getElementById("tc-quiz-view-overlay")?.classList.contains("open")) {
            lockBodyScroll(false);
        }
    }

    function closeQuizView() {
        const overlay = document.getElementById("tc-quiz-view-overlay");
        const questions = document.getElementById("tc-quiz-view-questions");
        if (questions) questions.innerHTML = "";
        if (overlay) {
            overlay.classList.remove("open");
            overlay.setAttribute("aria-hidden", "true");
        }
        // Return focus to course view if it is still open
        const courseOverlay = document.getElementById("tc-course-view-overlay");
        if (courseOverlay && courseOverlay.classList.contains("open")) {
            lockBodyScroll(true);
        } else {
            lockBodyScroll(false);
        }
    }

    function openQuizView(courseDetail, chapter) {
        const overlay = document.getElementById("tc-quiz-view-overlay");
        const titleEl = document.getElementById("tc-quiz-view-title");
        const chapterLabel = document.getElementById("tc-quiz-view-chapter-label");
        const questionsEl = document.getElementById("tc-quiz-view-questions");
        if (!overlay || !questionsEl) return;

        const quiz = chapter.quiz || {};
        const qCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;

        if (chapterLabel) {
            chapterLabel.textContent = `Chapter ${chapter.Chapter_Number || ""} · ${chapter.Chapter_Title || "Quiz"}`;
        }
        if (titleEl) {
            titleEl.textContent = quiz.Quiz_Title || `${chapter.Chapter_Title || "Chapter"} Quiz`;
        }

        questionsEl.innerHTML = renderInteractiveQuiz(quiz, chapter.Chapter_ID);
        bindQuizInteractions(questionsEl);

        const progressLabel = document.getElementById("tc-quiz-view-progress");
        if (progressLabel) progressLabel.textContent = `0 / ${qCount} answered`;
        const progressFill = document.getElementById("tc-quiz-progress-fill");
        if (progressFill) progressFill.style.width = "0%";

        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
        lockBodyScroll(true);
    }

    async function fetchCourseDetail(courseId) {
        if (detailsCache[courseId]) return detailsCache[courseId];

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
        const detail = await response.json();
        detailsCache[courseId] = detail;
        return detail;
    }

    async function openCourseView(courseSummary) {
        await ensureCourseCardComponentsLoaded();

        const overlay = document.getElementById("tc-course-view-overlay");
        const titleEl = document.getElementById("tc-course-view-title");
        const descEl = document.getElementById("tc-course-view-description");
        const priceEl = document.getElementById("tc-course-view-price");
        const chaptersBadge = document.getElementById("tc-course-view-chapters");
        const listEl = document.getElementById("tc-course-view-chapters-list");
        if (!overlay || !listEl) return;

        if (titleEl) titleEl.textContent = courseSummary.Title || "Untitled Course";
        if (descEl) {
            descEl.textContent =
                courseSummary.Description && String(courseSummary.Description).trim()
                    ? courseSummary.Description
                    : "No description provided.";
        }
        if (priceEl) priceEl.textContent = formatPrice(courseSummary.Price);
        if (chaptersBadge) {
            const count = courseSummary.chapter_count || 0;
            chaptersBadge.textContent = count === 1 ? "1 Chapter" : `${count} Chapters`;
        }

        listEl.innerHTML = `<p class="tc-details-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading course modules...</p>`;
        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden", "false");
        lockBodyScroll(true);

        try {
            const detail = await fetchCourseDetail(courseSummary.Course_ID);
            activeCourseDetail = detail;

            if (titleEl) titleEl.textContent = detail.Title || courseSummary.Title || "Untitled Course";
            if (descEl) {
                descEl.textContent =
                    detail.Description && String(detail.Description).trim()
                        ? detail.Description
                        : "No description provided.";
            }
            if (priceEl) priceEl.textContent = formatPrice(detail.Price);
            if (chaptersBadge) {
                const count = (detail.chapters || []).length;
                chaptersBadge.textContent = count === 1 ? "1 Chapter" : `${count} Chapters`;
            }

            listEl.innerHTML = buildChapterListHtml(detail.chapters || []);
            bindCourseViewChapterEvents(listEl, detail);
        } catch (err) {
            console.error(err);
            listEl.innerHTML = `<p class="tc-details-error"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(err.message)}</p>`;
        }
    }

    function createCourseCard(course) {
        const card = document.createElement("article");
        card.className = "tc-course-card";
        card.dataset.courseId = course.Course_ID;

        const chapterLabel =
            course.chapter_count === 1 ? "1 Chapter" : `${course.chapter_count || 0} Chapters`;
        const desc =
            course.Description && String(course.Description).trim()
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
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> View Details
                    </button>
                </div>
            </div>
        `;

        const editBtn = card.querySelector(".tc-btn-edit-info");
        const viewBtn = card.querySelector(".tc-btn-view-details");

        if (editBtn) {
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openEditCourseModal(course);
            });
        }
        if (viewBtn) {
            viewBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openCourseView(course);
            });
        }

        card.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            openCourseView(course);
        });

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

    window.fetchAndRenderTeacherCourses = fetchAndRenderTeacherCourses;
    window.openEditCourseModal = openEditCourseModal;
})();
