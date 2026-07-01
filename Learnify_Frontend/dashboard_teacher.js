document.addEventListener("DOMContentLoaded", function () {

    // ==========================================
    // 🆕 0. GLOBAL CONFIGURATION (URL එක එක තැනකින් පාලනය කිරීම)
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
    // ==========================================================
    // 📄 PDF FILE UPLOAD VISUAL BUG FIX (SAFE VERSION)
    // ==========================================================
    [1, 2, 3].forEach(chNum => {
        const pdfInput = document.getElementById(`ch${chNum}-pdf`);
        if (pdfInput) {
            pdfInput.addEventListener("change", function () {
                if (this.files && this.files.length > 0) {
                    const fileName = this.files[0].name;
                    
                    // 🚨 Input එක අස්සේ තියෙන Text එක විතරක් වෙනස් කරන්න වෙනම Span එකක් හදමු
                    // එතකොට Input Element එක මැකෙන්නේ නැහැ!
                    let statusSpan = this.parentElement.querySelector('.pdf-status-text');
                    
                    if (!statusSpan) {
                        // කලින් මෙහෙම Span එකක් නැත්නම් අලුතින් එකක් හදාගන්නවා
                        statusSpan = document.createElement('span');
                        statusSpan.className = 'pdf-status-text';
                        statusSpan.style.display = 'block';
                        statusSpan.style.marginTop = '5px';
                        statusSpan.style.fontSize = '12px';
                        this.parentElement.appendChild(statusSpan);
                    }
                    
                    // නම ලස්සනට පෙන්වනවා
                    statusSpan.innerHTML = `<i class="fa-solid fa-file-pdf" style="color: #e74c3c;"></i> Selected: <strong>${fileName}</strong>`;
                    statusSpan.style.color = "#2ecc71"; 
                }
            });
        }
    });

    // ==========================================
    // 5. 🤖 INTERACTIVE 1-TO-1 CHAPTER QUIZ GENERATION & BUNDLE FLOW
    // ==========================================
    const courseForm = document.getElementById("course-upload-form");

    let chapterQuizzesState = {
        1: { confirmed: false, data: null, realPdfPath: null },
        2: { confirmed: false, data: null, realPdfPath: null },
        3: { confirmed: false, data: null, realPdfPath: null }
    };

    // --- STEP A: EXECUTE INDIVIDUAL CHAPTER AI QUIZ GENERATION ---
    const executeQuizButtons = document.querySelectorAll(".btn-execute-chapter-quiz");
    
    executeQuizButtons.forEach(btn => {
        btn.addEventListener("click", async function () {
            const chNum = this.getAttribute("data-chap");
            const chTitle = document.getElementById(`ch${chNum}-title`).value;
            const chVideoUrl = document.getElementById(`ch${chNum}-video`).value;
            const chPdf = document.getElementById(`ch${chNum}-pdf`).files[0];

            // RAG Validation
            if (!chTitle || !chVideoUrl || !chPdf) {
                alert(`⚠️ Please insert Chapter ${chNum} Title, YouTube Video Link, and PDF before running the NLP AI Model generation!`);
                return;
            }

            // බටන් එක Loading ස්වභාවයට පත් කිරීම
            const originalBtnText = this.innerHTML;
            this.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating via AI...`;
            this.disabled = true;

            // 📦 FormData එක සකස් කිරීම
            const formData = new FormData();
            formData.append("chapter_title", chTitle);
            formData.append("youtube_url", chVideoUrl);
            formData.append("file", chPdf);

            try {
                // 🚀 REAL FETCH CALL TO RAG GENERATOR ENDPOINT (Global URL පාවිච්චි කර ඇත)
                const response = await fetch(`${API_BASE_URL}/teacher/generate-quiz`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Server returned error status: ${response.status}`);
                }

                // 1. බැක්එන්ඩ් එකෙන් ලැබෙන සැබෑ මුළු Response JSON එකම කියවීම
                const responseData = await response.json();
                
                // 2. බැක්එන්ඩ් එකෙන් එන සැබෑ PDF සර්වර් පාත් එක ලබා ගැනීම
                const backendPdfPath = responseData.pdf_path || "uploads/pdfs/default.pdf";
                
                // 3. බැක්එන්ඩ් එකෙන් එන 'quiz' object එක ලබා ගැනීම
                const realQuiz = responseData.quiz;
                const firstQuestion = (realQuiz && realQuiz.questions && realQuiz.questions.length > 0) 
                                      ? realQuiz.questions[0] 
                                      : null;

                // 4. බැක්එන්ඩ් එකේ සැබෑ Keys සමඟ දත්ත නිවැරදිව ගලපා ගැනීම
                const qText = firstQuestion ? firstQuestion.Question_Text : "Generated AI Question Text";
                const qA = firstQuestion ? firstQuestion.Option_A : "Option A";
                const qB = firstQuestion ? firstQuestion.Option_B : "Option B";
                const qC = firstQuestion ? firstQuestion.Option_C : "Option C";
                const qD = firstQuestion ? firstQuestion.Option_D : "Option D";
                const qCorrect = firstQuestion ? firstQuestion.Correct_Answer : "A";

                const previewWrapper = document.getElementById(`quiz-preview-ch${chNum}`);

                // 5. සැබෑ දත්ත UI එක මත පෙන්වීම
                previewWrapper.innerHTML = `
                    <div class="chapter-quiz-card" id="quiz-card-ch${chNum}" style="border: 1px solid #ddd; padding: 15px; margin-top: 15px; background: #fdfdfd; border-radius: 8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                            <h5 style="color:#0a1931; margin:0;"><i class="fa-solid fa-file-lines"></i> Quiz for Chapter ${chNum}: ${chTitle}</h5>
                            <span id="badge-ch${chNum}" class="badge" style="background:#e74c3c; color:white; padding:3px 8px; border-radius:4px; font-size:11px;">Pending Approval</span>
                        </div>
                        
                        <div class="form-group" style="margin-bottom:8px;">
                            <label style="font-size:12px; font-weight:600;">Question Text (You can Edit):</label>
                            <input type="text" id="raw-qtext-${chNum}" value="${qText}" style="background:#fff;">
                        </div>
                        
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                            <label style="font-size:12px;">A: <input type="text" id="raw-optA-${chNum}" value="${qA}"></label>
                            <label style="font-size:12px;">B: <input type="text" id="raw-optB-${chNum}" value="${qB}"></label>
                            <label style="font-size:12px;">C: <input type="text" id="raw-optC-${chNum}" value="${qC}"></label>
                            <label style="font-size:12px;">D: <input type="text" id="raw-optD-${chNum}" value="${qD}"></label>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <p style="margin:0; font-size:12px;">Correct Answer Key: <span style="color:#2ecc71; font-weight:700;" id="raw-correct-display-${chNum}">${qCorrect}</span></p>
                            <button type="button" class="btn-confirm-chapter-quiz" data-chap="${chNum}" style="background:#2ecc71; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">
                                <i class="fa-solid fa-check-double"></i> Confirm & Lock Quiz ${chNum}
                            </button>
                        </div>
                    </div>
                `;

                // --- STEP B: INDIVIDUAL CONFIRMATION LINKING ---
                previewWrapper.querySelector(".btn-confirm-chapter-quiz").addEventListener("click", function () {
                    const questionText = document.getElementById(`raw-qtext-${chNum}`).value;
                    const optA = document.getElementById(`raw-optA-${chNum}`).value;
                    const optB = document.getElementById(`raw-optB-${chNum}`).value;
                    const optC = document.getElementById(`raw-optC-${chNum}`).value;
                    const optD = document.getElementById(`raw-optD-${chNum}`).value;

                    chapterQuizzesState[chNum].confirmed = true;
                    chapterQuizzesState[chNum].data = {
                        Quiz_Title: `Chapter ${chNum} Smart Assessment Quiz`,
                        questions: [
                            {
                                Question_Text: questionText,
                                Option_A: optA,
                                Option_B: optB,
                                Option_C: optC,
                                Option_D: optD,
                                Correct_Answer: qCorrect
                            }
                        ]
                    };

                    // 🔥 බැක්එන්ඩ් එකෙන් ලැබුණු සැබෑ ස්ථිර PDF පාත් එක අපේ ස්ටේට් එකට දාගැනීම
                    chapterQuizzesState[chNum].realPdfPath = backendPdfPath;

                    const badge = document.getElementById(`badge-ch${chNum}`);
                    badge.textContent = "Verified & Locked";
                    badge.style.background = "#2ecc71";
                    document.getElementById(`quiz-card-ch${chNum}`).style.background = "#f4fbf7";
                    document.getElementById(`quiz-card-ch${chNum}`).style.borderColor = "#2ecc71";

                    alert(`✅ Chapter ${chNum} Quiz staging successful. (Ready for final course launch)`);
                });

            } catch (error) {
                console.error("RAG Generation Error:", error);
                alert(`❌ Failed to connect to AI RAG System! Please check your Backend.`);
            } finally {
                // බටන් එක යථා තත්ත්වයට පත් කිරීම
                this.innerHTML = originalBtnText;
                this.disabled = false;
            }
        });
    });

    // --- STEP C: ACTUALLY SUBMIT NESTED Blueprint TO FASTAPI BACKEND ---
    if (courseForm) {
        courseForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            if (!chapterQuizzesState[1].confirmed || !chapterQuizzesState[2].confirmed || !chapterQuizzesState[3].confirmed) {
                alert("⛔ Action Required: You must review and click 'Confirm & Lock Quiz' on ALL 3 Chapter Cards before launching!");
                return;
            }

            // 🆕 මුළු ෆෝම් එකම සබ්මිට් වෙන බටන් එක සිලෙක්ට් කරගැනීම
            const submitBtn = courseForm.querySelector("button[type='submit']");
            let originalSubmitText = "";
            if (submitBtn) {
                originalSubmitText = submitBtn.innerHTML;
                // 🆕 බටන් එක Disable කර කැරකෙන Spinner එකක් දැමීම (Double-click වැළැක්වීමට)
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
                // 🚀 REAL FETCH CALL TO ATOMIC CREATE COURSE (Global URL පාවිච්චි කර ඇත)
                const response = await fetch(`${API_BASE_URL}/teacher/create-course`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(finalCourseModulePayload)
                });

                if (response.ok) {
                    const result = await response.json();
                    alert(`🎉 Success! Course "${title}" and 3 Quizzes uploaded to Database successfully!`);
                    courseForm.reset();
                    document.querySelectorAll(".chapter-quiz-preview-area").forEach(el => el.innerHTML = "");
                    chapterQuizzesState = {
                        1: { confirmed: false, data: null, realPdfPath: null },
                        2: { confirmed: false, data: null, realPdfPath: null },
                        3: { confirmed: false, data: null, realPdfPath: null }
                    };
                } else {
                    const errorData = await response.json();
                    alert(`❌ Failed to save course: ${errorData.detail || "Server Error"}`);
                }
            } catch (error) {
                console.error("Error submitting course:", error);
                alert("❌ Connection failed! Please check if FastAPI Backend is running.");
            } finally {
                // 🆕 වැඩේ ඉවර වුණාම බටන් එක ආපසු සාමාන්‍ය තත්ත්වයට පත් කිරීම
                if (submitBtn) {
                    submitBtn.innerHTML = originalSubmitText;
                    submitBtn.disabled = false;
                }
            }
        });
    }
});