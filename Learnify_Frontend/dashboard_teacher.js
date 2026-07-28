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

    console.log("✅ Teacher logged in:", userName);

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

    /** Map confirmed chapter quiz state to backend QuizCreate schema (Quiz_Title). */
    function buildChapterQuizPayload(chapterState) {
        const data = chapterState && chapterState.data ? chapterState.data : {};
        const quiz_title = data.Quiz_Title || data.quiz_title || "Chapter Quiz";
        return {
            Quiz_Title: quiz_title,
            questions: Array.isArray(data.questions) ? data.questions : []
        };
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
                        pText.innerHTML = `📄 PDF or <span>Browse</span>`;
                    }
                }
            });
        }
    });

    // ==========================================
    // STEP A: EXECUTE INDIVIDUAL CHAPTER AI QUIZ GENERATION
    // ==========================================
    const executeQuizButtons = document.querySelectorAll(".btn-execute-chapter-quiz");
    
    executeQuizButtons.forEach(btn => {
        // Ensure button doesn't submit form
        btn.type = "button"; 

        btn.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();

            const generateBtn = this;
            const originalBtnText = generateBtn.innerHTML;
            generateBtn.disabled = true;
            generateBtn.innerHTML = `⏳ Generating Quiz... Please wait`;
            
            // Block form submission
            if (generateBtn.form) {
                generateBtn.form.onsubmit = function(event) { 
                    event.preventDefault(); 
                    return false; 
                };
            }

            const chNum = parseInt(generateBtn.getAttribute("data-chap"), 10);
            console.log(`🚀 Generating quiz for Chapter ${chNum}...`);

            // Get form values
            const currentTitleInput = document.getElementById(`ch${chNum}-title`);
            const finalChTitle = currentTitleInput ? currentTitleInput.value.trim() : `Chapter ${chNum}`;

            const videoEl = document.getElementById(`ch${chNum}-video`);
            const pdfEl = document.getElementById(`ch${chNum}-pdf`);
            const chVideoUrl = videoEl ? videoEl.value.trim() : "";
            const chPdf = pdfEl && pdfEl.files ? pdfEl.files[0] : null;

            // Validate
            if (!finalChTitle || !chVideoUrl || !chPdf) {
                alert(`⚠️ Please insert Chapter ${chNum} Title, YouTube Video Link, and PDF before generating!`);
                generateBtn.innerHTML = originalBtnText;
                generateBtn.disabled = false;
                return;
            }

            console.log(`📝 Chapter ${chNum}:`, { title: finalChTitle, video: chVideoUrl, pdf: chPdf.name });

            const formData = new FormData();
            formData.append("chapter_title", finalChTitle);
            formData.append("youtube_url", chVideoUrl);
            formData.append("file", chPdf);

            try {
                let quizQuestions = [];
                let backendPdfPath = "uploads/pdfs/default.pdf";
                let fetchedQuizTitle = "";
                
                console.log(`📤 Sending Chapter ${chNum} to backend...`);
                
                const response = await fetch(`${API_BASE_URL}/teacher/generate-quiz`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    },
                    body: formData
                });

                console.log(`📊 Response status: ${response.status}`);

                let responseData = {};
                const responseText = await response.text();
                console.log(`📄 Raw response length: ${responseText.length} chars`);
                
                if (responseText) {
                    try {
                        responseData = JSON.parse(responseText);
                        console.log("✅ Response parsed successfully:", responseData);
                    } catch (parseError) {
                        console.warn("⚠️ Backend response was not valid JSON:", responseText.substring(0, 200));
                        responseData = { detail: responseText };
                    }
                }

                if (!response.ok) {
                    const detail = responseData.detail || responseData.message || `Server returned status ${response.status}`;
                    throw new Error(detail);
                }

                // Extract PDF path
                backendPdfPath = responseData.pdf_path || responseData.PDF_Path || "uploads/pdfs/default.pdf";
                
                // Extract questions
                if (Array.isArray(responseData.questions)) {
                    quizQuestions = responseData.questions;
                    console.log(`✅ Found ${quizQuestions.length} questions in responseData.questions`);
                } else if (responseData.quiz && Array.isArray(responseData.quiz.questions)) {
                    quizQuestions = responseData.quiz.questions;
                    fetchedQuizTitle = responseData.quiz.Quiz_Title || responseData.quiz.quiz_title || responseData.quiz.quiz_Title;
                    console.log(`✅ Found ${quizQuestions.length} questions in responseData.quiz.questions`);
                } else if (Array.isArray(responseData)) {
                    quizQuestions = responseData;
                    console.log(`✅ Found ${quizQuestions.length} questions in responseData array`);
                }

                // If no questions, create fallback
                if (quizQuestions.length === 0) {
                    console.warn("⚠️ No questions from backend, generating fallback questions...");
                    for (let i = 1; i <= 5; i++) {
                        quizQuestions.push({
                            Question_Text: `Sample Question ${i} about ${finalChTitle}`,
                            Option_A: `Option A for Q${i}`,
                            Option_B: `Option B for Q${i}`,
                            Option_C: `Option C for Q${i}`,
                            Option_D: `Option D for Q${i}`,
                            Correct_Answer: "A"
                        });
                    }
                    console.log(`✅ Created ${quizQuestions.length} fallback questions`);
                }

                const finalQuizTitle = fetchedQuizTitle || `${finalChTitle} Assessment Quiz`;
                
                // Get DOM elements
                const toggleArea = document.getElementById(`toggle-area-ch${chNum}`);
                const previewBox = document.getElementById(`preview-box-ch${chNum}`);

                if (!toggleArea || !previewBox) {
                    alert(`❌ HTML Error: Cannot find toggle-area or preview-box for Chapter ${chNum}`);
                    return;
                }

                console.log(`📊 Rendering ${quizQuestions.length} questions...`);

                if (typeof renderGoogleFormQuiz === "function") {
                    renderGoogleFormQuiz(quizQuestions, previewBox, chNum);
                } else if (typeof renderCleanQuizPreview === "function") {
                    renderCleanQuizPreview(quizQuestions, previewBox);
                } else {
                    console.error("❌ No quiz preview renderer loaded (renderGoogleFormQuiz / renderCleanQuizPreview).");
                    alert("Error: quiz preview scripts not loaded. Please check script loading order.");
                    return;
                }

                previewBox.style.display = "block";
                previewBox.classList.add("active");

                // Create toggle link
                toggleArea.innerHTML = `
                    <a href="javascript:void(0);" id="toggle-link-ch${chNum}" style="color: #1A3D63; font-weight: 600; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; background: #B3CFE5; padding: 6px 12px; border-radius: 4px; border: 1px solid #4A7FA7; margin-top: 5px;">
                        <i class="fa-solid fa-file-lines"></i> 📄 Hide Generated Quiz <i class="fa-solid fa-chevron-up" style="font-size: 11px;"></i>
                    </a>
                `;

                // Toggle functionality
                document.getElementById(`toggle-link-ch${chNum}`).addEventListener("click", function() {
                    if (previewBox.style.display === "none" || previewBox.style.display === "") {
                        previewBox.style.display = "block"; 
                        previewBox.classList.add("active");
                        this.innerHTML = `<i class="fa-solid fa-file-lines"></i> 📄 Hide Generated Quiz <i class="fa-solid fa-chevron-up" style="font-size: 11px;"></i>`;
                    } else {
                        previewBox.style.display = "none"; 
                        previewBox.classList.remove("active");
                        this.innerHTML = `<i class="fa-solid fa-file-lines"></i> 📄 View Generated Quiz (${quizQuestions.length} MCQs) <i class="fa-solid fa-chevron-down" style="font-size: 11px;"></i>`;
                    }
                });

                // Confirm button functionality
                setTimeout(() => {
                    const confirmBtn = previewBox.querySelector(".btn-confirm-chapter-quiz");
                    if (confirmBtn) {
                        console.log("✅ Confirm button found, adding event listener...");
                        confirmBtn.addEventListener("click", function () {
                            console.log(`🔒 Save & Confirm clicked for Chapter ${chNum}`);

                            const questionElements = previewBox.querySelectorAll(".single-question-item");
                            if (questionElements.length === 0) {
                                alert("⚠️ No questions found to confirm!");
                                return;
                            }

                            let finalQuestionsArray = [];
                            let validationPassed = true;

                            if (typeof collectEditedQuestionsFromPreview === "function") {
                                finalQuestionsArray = collectEditedQuestionsFromPreview(previewBox);
                            } else {
                                questionElements.forEach((el, index) => {
                                    const ans = el.querySelector(".edit-correct").value.toUpperCase().trim();
                                    if (!["A", "B", "C", "D"].includes(ans)) {
                                        alert(`⚠️ Validation Error: Question ${index + 1} - Correct answer must be A, B, C, or D. Found "${ans}" instead.`);
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
                            }

                            if (finalQuestionsArray.length !== questionElements.length) {
                                validationPassed = false;
                                alert("⚠️ Each question must have a correct answer of A, B, C, or D.");
                            }

                            if (!validationPassed) return;

                            // Update state
                            chapterQuizzesState[chNum].confirmed = true;
                            chapterQuizzesState[chNum].data = {
                                quiz_title: finalQuizTitle,
                                questions: finalQuestionsArray
                            };
                            chapterQuizzesState[chNum].realPdfPath = backendPdfPath;

                            console.log(`✅ Chapter ${chNum} confirmed:`, chapterQuizzesState[chNum]);

                            // Update badge
                            const badge = document.getElementById(`badge-ch${chNum}`);
                            if (badge) {
                                badge.textContent = "✅ Verified & Locked";
                                badge.className = "badge badge-success";
                            }
                            
                            // Update card
                            const quizCard = document.getElementById(`quiz-card-ch${chNum}`);
                            if (quizCard) {
                                quizCard.style.background = "#f4fbf7";
                                quizCard.style.borderColor = "#2ecc71";
                            }

                            // Disable confirm button
                            this.disabled = true;
                            this.innerHTML = `<i class="fa-solid fa-check-circle"></i> Saved & Confirmed ✓`;

                            alert(`✅ Chapter ${chNum} quiz saved & confirmed with ${finalQuestionsArray.length} questions!`);
                        });
                    } else {
                        console.warn(`⚠️ Confirm button not found for Chapter ${chNum}`);
                    }
                }, 300);

                alert(`✅ Chapter ${chNum} Quiz generated with ${quizQuestions.length} questions!`);

            } catch (error) {
                console.error(`🔴 Error generating quiz for Chapter ${chNum}:`, error);
                alert(`❌ Error: ${error.message}`);
            } finally {
                generateBtn.innerHTML = originalBtnText;
                generateBtn.disabled = false;
                console.log(`✅ Chapter ${chNum} process completed`);
            }
        });
    });

    // ==========================================
    // STEP B: SUBMIT BUNDLE TO FASTAPI BACKEND
    // ==========================================
    if (courseForm) {
        courseForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            // Check all chapters are confirmed
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
                        quiz: buildChapterQuizPayload(chapterQuizzesState[1])
                    },
                    {
                        Chapter_Number: 2,
                        Chapter_Title: document.getElementById("ch2-title").value,
                        Video_Link_Or_Path: document.getElementById("ch2-video").value,
                        PDF_Link_Or_Path: chapterQuizzesState[2].realPdfPath || "uploads/pdfs/default.pdf",
                        quiz: buildChapterQuizPayload(chapterQuizzesState[2])
                    },
                    {
                        Chapter_Number: 3,
                        Chapter_Title: document.getElementById("ch3-title").value,
                        Video_Link_Or_Path: document.getElementById("ch3-video").value,
                        PDF_Link_Or_Path: chapterQuizzesState[3].realPdfPath || "uploads/pdfs/default.pdf",
                        quiz: buildChapterQuizPayload(chapterQuizzesState[3])
                    }
                ]
            };

            console.log("📤 Submitting course:", finalCourseModulePayload);

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
                    
                    // Reset UI
                    [1, 2, 3].forEach(num => {
                        const dropZone = document.getElementById(`ch${num}-pdf`)?.closest('.file-drop-zone');
                        const pText = dropZone?.querySelector('p');
                        if (pText) pText.innerHTML = `📄 PDF or <span>Browse</span>`;
                        
                        const badge = document.getElementById(`badge-ch${num}`);
                        if (badge) {
                            badge.textContent = "Pending";
                            badge.className = "badge badge-warning";
                        }
                        
                        const quizCard = document.getElementById(`quiz-card-ch${num}`);
                        if (quizCard) {
                            quizCard.style.background = "white";
                            quizCard.style.borderColor = "#3498db";
                        }
                    });

                    document.querySelectorAll(".chapter-quiz-toggle-area").forEach(div => div.innerHTML = "");
                    document.querySelectorAll(".chapter-quiz-preview-box").forEach(div => {
                        div.innerHTML = "";
                        div.style.display = "none";
                        div.classList.remove("active");
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

    console.log("✅ Teacher Dashboard initialized successfully!");
});