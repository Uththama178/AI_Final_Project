document.addEventListener("DOMContentLoaded", function () {
    
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
    // 5. 🤖 INTERACTIVE 1-TO-1 CHAPTER QUIZ GENERATION & BUNDLE FLOW
    // ==========================================
    const btnExecuteQuiz = document.getElementById("btn-execute-quiz");
    const aiQuizChaptersWrapper = document.getElementById("ai-quiz-chapters-wrapper");
    const courseForm = document.getElementById("course-upload-form");

    let chapterQuizzesState = {
        1: { confirmed: false, data: null },
        2: { confirmed: false, data: null },
        3: { confirmed: false, data: null }
    };

    // --- STEP A: EXECUTE AI QUIZ GENERATION ---
    btnExecuteQuiz.addEventListener("click", function () {
        const ch1Title = document.getElementById("ch1-title").value;
        const ch2Title = document.getElementById("ch2-title").value;
        const ch3Title = document.getElementById("ch3-title").value;

        if (!ch1Title || !ch2Title || !ch3Title) {
            alert("⚠️ Please insert all Chapter titles before running the NLP AI Model generation!");
            return;
        }

        alert("🤖 Learnify T5 NLP Engine is processing files... Generating 1 target Quiz per Chapter.");

        const mockRawAiResponse = [
            { chapterNum: 1, title: ch1Title, text: "Which component is mandatory to construct an Object in Java?", a: "Method", b: "Constructor", c: "Package", d: "Static Block", correct: "B" },
            { chapterNum: 2, title: ch2Title, text: "Which Java keyword establishes a Parent-Child relationship between classes?", a: "implements", b: "extends", c: "super", d: "instanceof", correct: "B" },
            { chapterNum: 3, title: ch3Title, text: "Hiding internal data blueprints and restricting direct access is known as?", a: "Polymorphism", b: "Inheritance", c: "Encapsulation", d: "Abstraction", correct: "C" }
        ];

        aiQuizChaptersWrapper.innerHTML = "";

        mockRawAiResponse.forEach((q) => {
            aiQuizChaptersWrapper.innerHTML += `
                <div class="chapter-quiz-card" id="quiz-card-ch${q.chapterNum}" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; background: #fdfdfd; border-radius: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                        <h5 style="color:#0a1931; margin:0;"><i class="fa-solid fa-file-lines"></i> Quiz for Chapter ${q.chapterNum}: ${q.title}</h5>
                        <span id="badge-ch${q.chapterNum}" class="badge" style="background:#e74c3c; color:white; padding:3px 8px; border-radius:4px; font-size:11px;">Pending Approval</span>
                    </div>
                    
                    <div class="form-group" style="margin-bottom:8px;">
                        <label style="font-size:12px; font-weight:600;">Question Text:</label>
                        <input type="text" id="raw-qtext-${q.chapterNum}" value="${q.text}" style="background:#fff;">
                    </div>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                        <label style="font-size:12px;">A: <input type="text" id="raw-optA-${q.chapterNum}" value="${q.a}"></label>
                        <label style="font-size:12px;">B: <input type="text" id="raw-optB-${q.chapterNum}" value="${q.b}"></label>
                        <label style="font-size:12px;">C: <input type="text" id="raw-optC-${q.chapterNum}" value="${q.c}"></label>
                        <label style="font-size:12px;">D: <input type="text" id="raw-optD-${q.chapterNum}" value="${q.d}"></label>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <p style="margin:0; font-size:12px;">Correct Answer Key: <span style="color:#2ecc71; font-weight:700;">${q.correct}</span></p>
                        <button type="button" class="btn-confirm-chapter-quiz" data-chap="${q.chapterNum}" data-correct="${q.correct}" style="background:#2ecc71; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">
                            <i class="fa-solid fa-check-double"></i> Confirm & Lock Quiz ${q.chapterNum}
                        </button>
                    </div>
                </div>
            `;
        });

        // --- STEP B: CONFIRMATION LOGIC ---
        const confirmButtons = document.querySelectorAll(".btn-confirm-chapter-quiz");
        confirmButtons.forEach(btn => {
            btn.addEventListener("click", function () {
                const chNum = this.getAttribute("data-chap");
                const correctAnswerKey = this.getAttribute("data-correct");

                const questionText = document.getElementById(`raw-qtext-${chNum}`).value;
                const optA = document.getElementById(`raw-optA-${chNum}`).value;
                const optB = document.getElementById(`raw-optB-${chNum}`).value;
                const optC = document.getElementById(`raw-optC-${chNum}`).value;
                const optD = document.getElementById(`raw-optD-${chNum}`).value;

                chapterQuizzesState[chNum].confirmed = true;
                chapterQuizzesState[chNum].data = {
                    Quiz_Title: `Chapter ${chNum} Smart Assessment Quiz`,
                    Questions: [
                        {
                            Question_Text: questionText,
                            Option_A: optA,
                            Option_B: optB,
                            Option_C: optC,
                            Option_D: optD,
                            Correct_Answer: correctAnswerKey
                        }
                    ]
                };

                const badge = document.getElementById(`badge-ch${chNum}`);
                badge.textContent = "Verified & Locked";
                badge.style.background = "#2ecc71";
                document.getElementById(`quiz-card-ch${chNum}`).style.background = "#f4fbf7";
                document.getElementById(`quiz-card-ch${chNum}`).style.borderColor = "#2ecc71";

                alert(`✅ Chapter ${chNum} Quiz staging successful.`);
            });
        });
    });

    // --- STEP C: ACTUALLY SUBMIT NESTED BluePrint TO FASTAPI BACKEND ---
    if (courseForm) {
        courseForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            if (!chapterQuizzesState[1].confirmed || !chapterQuizzesState[2].confirmed || !chapterQuizzesState[3].confirmed) {
                alert("⛔ Action Required: You must review and click 'Confirm & Lock Quiz' on ALL 3 Chapter Cards before launching!");
                return;
            }

            const title = document.getElementById("course-title").value;
            const description = document.getElementById("course-desc").value;
            const price = document.getElementById("course-price").value;

            // Mismatches සියල්ල නිවැරදි කරන ලද Final Object Payload එක
            const finalCourseModulePayload = {
                Title: title,
                Description: description,
                Price: parseFloat(price),
                Chapters: [
                    {
                        Chapter_Number: 1,
                        Chapter_Title: document.getElementById("ch1-title").value,
                        Video_Link_Or_Path: "uploads/videos/ch1_course_file.mp4", // *මීළඟ සතියේ File Upload එකට මාරු කරමු
                        PDF_Link_Or_Path: "uploads/documents/ch1_course_file.pdf",
                        Quiz: chapterQuizzesState[1].data
                    },
                    {
                        Chapter_Number: 2,
                        Chapter_Title: document.getElementById("ch2-title").value,
                        Video_Link_Or_Path: "uploads/videos/ch2_course_file.mp4",
                        PDF_Link_Or_Path: "uploads/documents/ch2_course_file.pdf",
                        Quiz: chapterQuizzesState[2].data
                    },
                    {
                        Chapter_Number: 3,
                        Chapter_Title: document.getElementById("ch3-title").value,
                        Video_Link_Or_Path: "uploads/videos/ch3_course_file.mp4",
                        PDF_Link_Or_Path: "uploads/documents/ch3_course_file.pdf",
                        Quiz: chapterQuizzesState[3].data
                    }
                ]
            };

            try {
                // REAL FETCH CALL TO FASTAPI
                const response = await fetch("http://127.0.0.1:8000/courses/create", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` // Logged-in Teacher ගේ Token එක හරහා Secure කිරීම
                    },
                    body: JSON.stringify(finalCourseModulePayload)
                });

                if (response.ok) {
                    const result = await response.json();
                    alert(`🎉 Success! Course "${title}" and 3 Quizzes uploaded to Database successfully!`);
                    courseForm.reset();
                    aiQuizChaptersWrapper.innerHTML = `<p class="placeholder-text">Please click "Execute AI Quiz Generation"...</p>`;
                } else {
                    const errorData = await response.json();
                    alert(`❌ Failed to save course: ${errorData.detail || "Server Error"}`);
                }
            } catch (error) {
                console.error("Error submitting course:", error);
                alert("❌ Connection failed! Please check if FastAPI Backend is running.");
            }
        });
    }
});