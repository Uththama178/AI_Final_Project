document.addEventListener("DOMContentLoaded", function () {

    // ==========================================
    // 🆕 GLOBAL CONFIGURATION
    // ==========================================
    const API_BASE_URL = "http://127.0.0.1:8000";

    // ==========================================
    // 1. 🛡️ ROUTE GUARD
    // ==========================================
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("user_role");
    const userName = localStorage.getItem("user_name");
    const userEmail = localStorage.getItem("user_email");

    if (!token || !role || (role.toLowerCase() !== "teacher" && role.toLowerCase() !== "both")) {
        alert("Access Denied! Please login as a Teacher.");
        window.location.href = "login.html";
        return;
    }

    // ==========================================
    // 2. 👤 DISPLAY TEACHER INFO
    // ==========================================
    const nameDisplay = document.getElementById("teacher-display-name");
    const emailDisplay = document.getElementById("teacher-display-email");

    if (nameDisplay && userName) nameDisplay.textContent = userName;
    if (emailDisplay && userEmail) emailDisplay.textContent = userEmail;

    // ==========================================
    // 3. 📑 TAB SWITCHING LOGIC
    // ==========================================
    const menuItems = document.querySelectorAll(".sidebar-menu .menu-item");
    const tabContents = document.querySelectorAll(".tab-content");

    menuItems.forEach(item => {
        item.addEventListener("click", function () {
            menuItems.forEach(i => i.classList.remove("active"));
            tabContents.forEach(tc => tc.classList.remove("active"));

            this.classList.add("active");
            const tabId = this.getAttribute("data-tab");
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add("active");
        });
    });

    // ==========================================
    // 4. 🚪 LOGOUT LOGIC
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
    // 5. INTERACTIVE MULTI-QUESTION QUIZ GENERATION & BUNDLE FLOW
    // ==========================================
    const courseForm = document.getElementById("course-upload-form");

    let chapterQuizzesState = {
        1: { confirmed: false, data: null, realPdfPath: null },
        2: { confirmed: false, data: null, realPdfPath: null },
        3: { confirmed: false, data: null, realPdfPath: null }
    };

    function escapeHtml(text) {
        if (!text) return "";
        return text
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- 📄 LIVE PDF NAME DISPLAY INSIDE DROP ZONE ---
    [1, 2, 3].forEach(chNum => {
        const pdfInput = document.getElementById(`ch${chNum}-pdf`);
        if (pdfInput) {
            pdfInput.addEventListener("change", function (e) {
                const dropZone = this.closest('.file-drop-zone');
                if (!dropZone) return;

                let pText = dropZone.querySelector('p');

                if (e.target.files && e.target.files.length > 0) {
                    const fileName = e.target.files[0].name;
                    if (pText) {
                        pText.innerHTML = `<i class="fa-solid fa-file-pdf" style="color: #e74c3c; font-size: 16px;"></i> Selected: <span style="color:#2980b9; font-weight:600;">${escapeHtml(fileName)}</span>`;
                    }
                } else {
                    if (pText) {
                        pText.innerHTML = `PDF or <span>Browse</span>`;
                    }
                }
            });
        }
    });

    // --- STEP A: EXECUTE INDIVIDUAL CHAPTER AI QUIZ GENERATION ---
    const executeQuizButtons = document.querySelectorAll(".btn-execute-chapter-quiz");
    
    executeQuizButtons.forEach(btn => {
        btn.addEventListener("click", async function (e) {
            
            e.preventDefault();

            const chNum = parseInt(this.getAttribute("data-chap"), 10);

            const currentTitleInput = document.getElementById(`ch${chNum}-title`);
            const finalChTitle = currentTitleInput ? currentTitleInput.value.trim() : `Chapter ${chNum}`;

            const videoEl = document.getElementById(`ch${chNum}-video`);
            const pdfEl = document.getElementById(`ch${chNum}-pdf`);
            const chVideoUrl = videoEl ? videoEl.value.trim() : "";
            const chPdf = pdfEl && pdfEl.files ? pdfEl.files[0] : null;

            if (!finalChTitle || !chVideoUrl || !chPdf) {
                alert(`⚠️ Please insert Chapter ${chNum} Title, YouTube Video Link, and PDF before running the NLP AI Model generation!`);
                return;
            }

            const originalBtnText = this.innerHTML;
            this.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating via AI...`;
            this.disabled = true;

            const formData = new FormData();
            formData.append("chapter_title", finalChTitle);
            formData.append("youtube_url", chVideoUrl);
            formData.append("file", chPdf);

            try {
                let quizQuestions = [];
                let backendPdfPath = "uploads/pdfs/default.pdf";
                let fetchedQuizTitle = "";

                console.log(`🚀 Sending Chapter ${chNum} request to backend...`);
                
                const response = await fetch(`${API_BASE_URL}/teacher/generate-quiz`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    },
                    body: formData
                });

                let responseData = {};
                const responseText = await response.text();
                if (responseText) {
                    try {
                        responseData = JSON.parse(responseText);
                    } catch (parseError) {
                        console.warn("⚠️ Backend response was not valid JSON:", responseText);
                        responseData = { detail: responseText };
                    }
                }

                if (!response.ok) {
                    const detail = responseData.detail || responseData.message || `Server returned status ${response.status}`;
                    throw new Error(detail);
                }

                console.log("📥 Backend Data Received successfully:", responseData);

                backendPdfPath = responseData.pdf_path || responseData.PDF_Path || "uploads/pdfs/default.pdf";
                
                if (Array.isArray(responseData.questions)) {
                    quizQuestions = responseData.questions;
                } else if (responseData.quiz && Array.isArray(responseData.quiz.questions)) {
                    quizQuestions = responseData.quiz.questions;
                    fetchedQuizTitle = responseData.quiz.Quiz_Title || responseData.quiz.quiz_title || responseData.quiz.quiz_Title;
                } else if (Array.isArray(responseData)) {
                    quizQuestions = responseData;
                }

                if (quizQuestions.length === 0) {
                    console.warn("⚠️ No questions parsed, generating test fallback questions...");
                    for (let i = 1; i <= 10; i++) {
                        quizQuestions.push({
                            Question_Text: `What is the core concept discussed in ${finalChTitle} - Question ${i}?`,
                            Option_A: `Alternative Answer Option A`,
                            Option_B: `Alternative Answer Option B`,
                            Option_C: `Alternative Answer Option B`,
                            Option_D: `Alternative Answer Option D`,
                            Correct_Answer: "A"
                        });
                    }
                }

                const finalQuizTitle = fetchedQuizTitle || `${finalChTitle} Assessment Quiz`;
                
                const toggleArea = document.getElementById(`toggle-area-ch${chNum}`);
                const previewBox = document.getElementById(`preview-box-ch${chNum}`);

                if (!toggleArea || !previewBox) {
                    alert(`❌ HTML Error: Cannot find toggle-area or preview-box for Chapter ${chNum}`);
                    return;
                }

                console.log("Questions to render:", quizQuestions);

                // --- 📄 INTERACTIVE TOGGLE AREA & PREVIEW BOX FLOW ---
                if (quizQuestions.length > 0) {
                    
                    // 1. Toggle Link එක නිර්මාණය කරනවා
                    toggleArea.innerHTML = `
                        <a href="javascript:void(0);" id="toggle-link-ch${chNum}" style="color: #1A3D63; font-weight: 600; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; background: #B3CFE5; padding: 6px 12px; border-radius: 4px; border: 1px solid #4A7FA7; margin-top: 5px;">
                            <i class="fa-solid fa-file-lines"></i> 📄 Hide Generated Quiz <i class="fa-solid fa-chevron-up" style="font-size: 11px;"></i>
                        </a>
                    `;

                    // 2. 🌟 FIXED: ඔයාගේ ෆන්ක්ෂන් එකට හරියටම parameters 2ක් විතරක් පාස් කරනවා
                    renderCleanQuizPreview(quizQuestions, previewBox);
                    previewBox.style.display = "block";

                    // 3. ලිංක් එක ක්ලික් කරාම On/Off (Toggle) වෙන වැඩේ
                    document.getElementById(`toggle-link-ch${chNum}`).addEventListener("click", function() {
                        if (previewBox.style.display === "none" || previewBox.style.display === "") {
                            previewBox.style.display = "block"; // Open කරනවා
                            this.innerHTML = `<i class="fa-solid fa-file-lines"></i> 📄 Hide Generated Quiz <i class="fa-solid fa-chevron-up" style="font-size: 11px;"></i>`;
                        } else {
                            previewBox.style.display = "none"; // Close කරනවා
                            this.innerHTML = `<i class="fa-solid fa-file-lines"></i> 📄 View Generated Quiz (${quizQuestions.length} MCQs) <i class="fa-solid fa-chevron-down" style="font-size: 11px;"></i>`;
                        }
                    });

                    // 4. 🌟 FIXED: ප්‍රශ්න ටික render වුණාට පස්සේ, "Confirm & Lock" බටන් එක ක්ලික් කරාම 
                    // global state එකට දත්ත ටික හරියටම සේဝ် වෙන්න Listener එක මෙතනින් වෙනම අමුණනවා.
                    setTimeout(() => {
                        const confirmBtn = previewBox.querySelector(".btn-confirm-chapter-quiz");
                        if (confirmBtn) {
                            confirmBtn.addEventListener("click", function () {
                                const questionElements = previewBox.querySelectorAll(".single-question-item");
                                let finalQuestionsArray = [];
                                let validationPassed = true;

                                questionElements.forEach(el => {
                                    const ans = el.querySelector(".edit-correct").value.toUpperCase().trim();
                                    
                                    if (!["A", "B", "C", "D"].includes(ans)) {
                                        alert(`⚠️ Validation Error: Correct answer must be either A, B, C, or D. Found "${ans}" instead.`);
                                        validationPassed = false;
                                        return;
                                    }

                                    finalQuestionsArray.push({
                                        Question_Text: el.querySelector(".edit-qtext").value,
                                        Option_A: el.querySelector(".edit-optA").value,
                                        Option_B: el.querySelector(".edit-optB").value,
                                        Option_C: el.querySelector(".edit-optC").value,
                                        Option_D: el.querySelector(".edit-optD").value,
                                        Correct_Answer: ans
                                    });
                                });

                                if (!validationPassed) return;

                                // මෙතනදී උඩ තියෙන dynamic විචල්‍යයන් (chNum, backendPdfPath, finalQuizTitle) කෙලින්ම පාවිච්චි වෙනවා
                                chapterQuizzesState[chNum].confirmed = true;
                                chapterQuizzesState[chNum].data = {
                                    quiz_title: finalQuizTitle,
                                    questions: finalQuestionsArray
                                };
                                chapterQuizzesState[chNum].realPdfPath = backendPdfPath;

                                // UI එක වෙනස් කිරීම
                                const badge = document.getElementById(`badge-ch${chNum}`);
                                if (badge) {
                                    badge.textContent = "Verified & Locked";
                                    badge.style.background = "#2ecc71";
                                }
                                
                                const quizCard = document.getElementById(`quiz-card-ch${chNum}`);
                                if (quizCard) {
                                    quizCard.style.background = "#f4fbf7";
                                    quizCard.style.borderColor = "#2ecc71";
                                }

                                alert(`✅ Chapter ${chNum} Quiz staging successful with ${finalQuestionsArray.length} questions!`);
                            });
                        }
                    }, 200);
                }

            } catch (error) {
                console.error("🔴 Staging Render Error:", error);
                alert(`❌ Configuration setup failed. Error Details: ${error.message}`);
            } finally {
                this.innerHTML = originalBtnText;
                this.disabled = false;
            }
        });
    });

    // ==========================================
    // --- STEP C: SUBMIT BUNDLE TO FASTAPI BACKEND ---
    // ==========================================
    if (courseForm) {
        courseForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            if (!chapterQuizzesState[1].confirmed || !chapterQuizzesState[2].confirmed || !chapterQuizzesState[3].confirmed) {
                alert("⛔ Action Required: You must review and click 'Confirm & Lock Quiz' on ALL 3 Chapter Cards before launching!");
                return;
            }

            const submitBtn = courseForm.querySelector("button[type='submit']");
            let originalSubmitText = "";
            if (submitBtn) {
                originalSubmitText = submitBtn.innerHTML;
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Launching Full Module Course...`;
                submitBtn.disabled = true;
            }

            const title = document.getElementById("course-title").value;
            const description = document.getElementById("course-desc").value;
            const price = document.getElementById("course-price").value;

            const finalCourseModulePayload = {
                Title: title,
                Description: description,
                Price: parseFloat(price),
                chapters: [
                    {
                        Chapter_Number: 1,
                        Chapter_Title: document.getElementById("ch1-title").value,
                        Video_Link_Or_Path: document.getElementById("ch1-video").value,
                        PDF_Link_Or_Path: chapterQuizzesState[1].realPdfPath || "uploads/pdfs/default.pdf",
                        quiz: chapterQuizzesState[1].data
                    },
                    {
                        Chapter_Number: 2,
                        Chapter_Title: document.getElementById("ch2-title").value,
                        Video_Link_Or_Path: document.getElementById("ch2-video").value,
                        PDF_Link_Or_Path: chapterQuizzesState[2].realPdfPath || "uploads/pdfs/default.pdf",
                        quiz: chapterQuizzesState[2].data
                    },
                    {
                        Chapter_Number: 3,
                        Chapter_Title: document.getElementById("ch3-title").value,
                        Video_Link_Or_Path: document.getElementById("ch3-video").value,
                        PDF_Link_Or_Path: chapterQuizzesState[3].realPdfPath || "uploads/pdfs/default.pdf",
                        quiz: chapterQuizzesState[3].data
                    }
                ]
            };

            try {
                const response = await fetch(`${API_BASE_URL}/teacher/create-course`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(finalCourseModulePayload)
                });

                if (response.ok) {
                    alert(`🎉 Success! Course "${title}" and all Quizzes uploaded successfully!`);
                    courseForm.reset();
                    
                    [1, 2, 3].forEach(num => {
                        const dropZone = document.getElementById(`ch${num}-pdf`)?.closest('.file-drop-zone');
                        const pText = dropZone?.querySelector('p');
                        if (pText) pText.innerHTML = `PDF or <span>Browse</span>`;
                    });

                    document.querySelectorAll(".chapter-quiz-toggle-area").forEach(div => div.innerHTML = "");
                    document.querySelectorAll(".chapter-quiz-preview-box").forEach(div => {
                        div.innerHTML = "";
                        div.style.display = "none";
                    });
                    
                    chapterQuizzesState = {
                        1: { confirmed: false, data: null, realPdfPath: null },
                        2: { confirmed: false, data: null, realPdfPath: null },
                        3: { confirmed: false, data: null, realPdfPath: null }
                    };
                } else {
                    const errData = await response.json();
                    alert(`❌ Failed to create course: ${errData.detail || "Server error"}`);
                }
            } catch (error) {
                console.error("🔴 Form Submission Error:", error);
                alert(`❌ Connection error: ${error.message}`);
            } finally {
                if (submitBtn) {
                    submitBtn.innerHTML = originalSubmitText;
                    submitBtn.disabled = false;
                }
            }
        });
    }
});