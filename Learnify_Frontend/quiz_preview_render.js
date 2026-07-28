/**

 * Quiz preview renderers for teacher dashboard chapter MCQs.

 * - renderCleanQuizPreview: legacy card layout (unchanged behavior)

 * - renderGoogleFormQuiz: Google Forms–inspired editable preview

 */



const GOOGLE_FORM_QUIZ_MAX_QUESTIONS = 10;



/**

 * Escape HTML to prevent XSS when injecting user/backend text into templates.

 * @param {string} text

 * @returns {string}

 */

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



/**

 * Normalize backend / RAG question objects to editable field values.

 * @param {object} q

 * @returns {{ questionText: string, optA: string, optB: string, optC: string, optD: string, correctAnswer: string }}

 */

function normalizeQuestionFields(q) {

    const options = Array.isArray(q.options) ? q.options : [];

    const questionText =

        q.Question_Text ||

        q.question_text ||

        q.Question ||

        q.question ||

        "";

    const optA = q.Option_A || q.option_a || q.OptionA || options[0] || "";

    const optB = q.Option_B || q.option_b || q.OptionB || options[1] || "";

    const optC = q.Option_C || q.option_c || q.OptionC || options[2] || "";

    const optD = q.Option_D || q.option_d || q.OptionD || options[3] || "";

    let correctAnswer = (q.Correct_Answer || q.correct_answer || q.Correct || "A")

        .toString()

        .toUpperCase()

        .trim();

    const validAnswers = ["A", "B", "C", "D"];

    if (!validAnswers.includes(correctAnswer)) {

        correctAnswer = "A";

    }

    return { questionText, optA, optB, optC, optD, correctAnswer };

}



/**

 * Google Forms–style MCQ card HTML for one question.

 * @param {object} q

 * @param {number} index

 * @returns {string}

 */

function buildGoogleFormQuestionCardHtml(q, index) {

    const { questionText, optA, optB, optC, optD, correctAnswer } = normalizeQuestionFields(q);

    const questionNumber = index + 1;



    const optionRow = (letter, value, inputClass) => `

        <div class="google-form-option-row">

            <span class="google-form-option-badge">${letter}</span>

            <input type="text" class="${inputClass} google-form-option-input" value="${escapeHtml(value)}" placeholder="Option ${letter}" aria-label="Option ${letter}">

        </div>

    `;



    return `

        <article class="google-form-mcq-card single-question-item" data-index="${index}">

            <div class="google-form-mcq-card-accent"></div>

            <div class="google-form-mcq-card-body">

                <header class="google-form-mcq-card-header">

                    <span class="google-form-mcq-number">Question ${questionNumber}</span>

                    <span class="google-form-mcq-required">Required</span>

                </header>

                <label class="google-form-field-label">Question</label>

                <textarea class="edit-qtext google-form-question-input" rows="2" placeholder="Enter question text">${escapeHtml(questionText)}</textarea>

                <div class="google-form-options-block">

                    <span class="google-form-field-label">Answer choices</span>

                    ${optionRow("A", optA, "edit-optA")}

                    ${optionRow("B", optB, "edit-optB")}

                    ${optionRow("C", optC, "edit-optC")}

                    ${optionRow("D", optD, "edit-optD")}

                </div>

                <div class="google-form-correct-row">

                    <label class="google-form-field-label" for="google-form-correct-${index}">Correct answer key</label>

                    <select id="google-form-correct-${index}" class="edit-correct google-form-correct-select" aria-label="Correct answer">

                        <option value="A" ${correctAnswer === "A" ? "selected" : ""}>A</option>

                        <option value="B" ${correctAnswer === "B" ? "selected" : ""}>B</option>

                        <option value="C" ${correctAnswer === "C" ? "selected" : ""}>C</option>

                        <option value="D" ${correctAnswer === "D" ? "selected" : ""}>D</option>

                    </select>

                </div>

            </div>

        </article>

    `;

}



/**

 * Inject Google Forms–style preview styles once per document.

 */

function ensureGoogleFormQuizStyles() {

    if (document.getElementById("google-form-quiz-styles")) {

        return;

    }

    const style = document.createElement("style");

    style.id = "google-form-quiz-styles";

    style.textContent = `

        .google-form-quiz-wrap { font-family: 'Poppins', 'Google Sans', Roboto, Arial, sans-serif; }

        .google-form-quiz-header-bar {

            height: 10px;

            background: linear-gradient(90deg, #673ab7 0%, #1a73e8 50%, #009688 100%);

            border-radius: 8px 8px 0 0;

        }

        .google-form-quiz-header-card {

            background: #fff;

            border: 1px solid #dadce0;

            border-top: none;

            border-radius: 0 0 8px 8px;

            padding: 20px 22px 14px;

            margin-bottom: 14px;

            box-shadow: 0 1px 2px rgba(60, 64, 67, 0.15);

        }

        .google-form-quiz-header-card h3 {

            margin: 0 0 6px;

            font-size: 1.25rem;

            font-weight: 500;

            color: #202124;

        }

        .google-form-quiz-header-card p {

            margin: 0;

            font-size: 13px;

            color: #5f6368;

        }

        .google-form-mcq-card {

            position: relative;

            background: #fff;

            border: 1px solid #dadce0;

            border-radius: 8px;

            margin-bottom: 12px;

            box-shadow: 0 1px 2px rgba(60, 64, 67, 0.12), 0 1px 3px rgba(60, 64, 67, 0.08);

            overflow: hidden;

        }

        .google-form-mcq-card-accent {

            height: 4px;

            background: #673ab7;

        }

        .google-form-mcq-card-body { padding: 18px 20px 16px; }

        .google-form-mcq-card-header {

            display: flex;

            justify-content: space-between;

            align-items: center;

            margin-bottom: 12px;

        }

        .google-form-mcq-number {

            font-size: 13px;

            font-weight: 600;

            color: #1a73e8;

        }

        .google-form-mcq-required {

            font-size: 11px;

            color: #d93025;

            font-weight: 600;

            text-transform: uppercase;

            letter-spacing: 0.02em;

        }

        .google-form-field-label {

            display: block;

            font-size: 12px;

            font-weight: 600;

            color: #5f6368;

            margin-bottom: 6px;

        }

        .google-form-question-input {

            width: 100%;

            border: none;

            border-bottom: 1px solid #dadce0;

            border-radius: 0;

            padding: 8px 4px 10px;

            font-size: 14px;

            color: #202124;

            font-family: inherit;

            resize: vertical;

            box-sizing: border-box;

            margin-bottom: 16px;

            background: transparent;

        }

        .google-form-question-input:focus {

            outline: none;

            border-bottom-color: #1a73e8;

            box-shadow: 0 1px 0 #1a73e8;

        }

        .google-form-options-block { margin-bottom: 14px; }

        .google-form-option-row {

            display: flex;

            align-items: center;

            gap: 10px;

            margin-bottom: 8px;

        }

        .google-form-option-badge {

            flex-shrink: 0;

            width: 28px;

            height: 28px;

            border-radius: 50%;

            border: 2px solid #dadce0;

            display: flex;

            align-items: center;

            justify-content: center;

            font-size: 12px;

            font-weight: 600;

            color: #5f6368;

            background: #fff;

        }

        .google-form-option-input {

            flex: 1;

            border: 1px solid #e8eaed;

            border-radius: 4px;

            padding: 8px 10px;

            font-size: 13px;

            color: #202124;

            box-sizing: border-box;

        }

        .google-form-option-input:focus {

            outline: none;

            border-color: #1a73e8;

            box-shadow: 0 0 0 1px #1a73e8;

        }

        .google-form-correct-row {

            display: flex;

            align-items: center;

            justify-content: space-between;

            gap: 12px;

            padding-top: 12px;

            border-top: 1px solid #f1f3f4;

        }

        .google-form-correct-select {

            padding: 8px 12px;

            border: 1px solid #dadce0;

            border-radius: 4px;

            font-weight: 600;

            color: #202124;

            background: #fff;

            cursor: pointer;

        }

        .google-form-quiz-footer {

            text-align: center;

            margin-top: 8px;

            padding: 18px 12px;

            background: #f8f9fa;

            border-radius: 8px;

            border: 1px solid #e8eaed;

        }

        .btn-save-confirm-google-quiz {

            background: #1a73e8;

            color: #fff;

            border: none;

            padding: 12px 28px;

            font-size: 14px;

            font-weight: 600;

            border-radius: 4px;

            cursor: pointer;

            box-shadow: 0 1px 2px rgba(26, 115, 232, 0.35);

        }

        .btn-save-confirm-google-quiz:hover { background: #1765cc; }

        .btn-save-confirm-google-quiz:disabled {

            background: #9aa0a6;

            cursor: not-allowed;

            box-shadow: none;

        }

        .google-form-quiz-footer-hint {

            font-size: 12px;

            color: #80868b;

            margin: 10px 0 0;

        }

    `;

    document.head.appendChild(style);

}



/**

 * Render chapter MCQs in a Google Forms–inspired editable layout.

 *

 * @param {Array} quizQuestions - MCQ objects from generate-quiz API

 * @param {HTMLElement} containerElement - e.g. #preview-box-ch1

 * @param {number} chapterNum - Chapter index (1–3) for header labeling

 * @returns {number} Count of questions rendered

 */

function renderGoogleFormQuiz(quizQuestions, containerElement, chapterNum) {

    if (!containerElement) {

        console.error("renderGoogleFormQuiz: missing container element");

        return 0;

    }



    if (!quizQuestions || !Array.isArray(quizQuestions)) {

        containerElement.innerHTML = `

            <div class="google-form-quiz-error" style="color:#d93025;padding:15px;background:#fce8e6;border-radius:8px;border:1px solid #f5c6c2;">

                <i class="fa-solid fa-circle-exclamation"></i> Invalid questions data received.

            </div>

        `;

        return 0;

    }



    if (quizQuestions.length === 0) {

        containerElement.innerHTML = `

            <div style="color:#e37400;padding:15px;background:#fef7e0;border-radius:8px;border:1px solid #feefc3;">

                <i class="fa-solid fa-info-circle"></i> No questions generated. Please try again.

            </div>

        `;

        return 0;

    }



    ensureGoogleFormQuizStyles();



    const questionsToRender = quizQuestions.slice(0, GOOGLE_FORM_QUIZ_MAX_QUESTIONS);

    const chapterLabel = typeof chapterNum === "number" ? chapterNum : "";



    let cardsHtml = "";

    questionsToRender.forEach((q, index) => {

        cardsHtml += buildGoogleFormQuestionCardHtml(q, index);

    });



    containerElement.innerHTML = `

        <div class="google-form-quiz-wrap" data-chapter="${chapterLabel}">

            <div class="google-form-quiz-header-bar"></div>

            <div class="google-form-quiz-header-card">

                <h3>Chapter ${chapterLabel} Quiz</h3>

                <p>Edit questions and options below, then save &amp; confirm this chapter.</p>

            </div>

            <div id="dynamic-questions-container" class="google-form-questions-list">

                ${cardsHtml}

            </div>

            <div class="google-form-quiz-footer">

                <button type="button" class="btn-save-confirm-google-quiz btn-confirm-chapter-quiz btn-lock-quiz">

                    <i class="fa-solid fa-check-double"></i> Save &amp; Confirm Chapter Quiz

                </button>

                <p class="google-form-quiz-footer-hint">

                    <i class="fa-solid fa-info-circle"></i> ${questionsToRender.length} question(s) — confirm to lock for course upload.

                </p>

            </div>

        </div>

    `;



    console.log(`✅ Google Form quiz preview rendered for chapter ${chapterLabel} (${questionsToRender.length} questions)`);

    return questionsToRender.length;

}



/**

 * Collect edited questions from a Google Form / legacy preview container.

 * @param {HTMLElement} containerElement

 * @returns {Array<object>}

 */

function collectEditedQuestionsFromPreview(containerElement) {

    const questionElements = containerElement.querySelectorAll(".single-question-item");

    const finalQuestionsArray = [];



    questionElements.forEach((el) => {

        const ansEl = el.querySelector(".edit-correct");

        const ans = ansEl ? ansEl.value.toUpperCase().trim() : "A";

        if (!["A", "B", "C", "D"].includes(ans)) {

            return;

        }

        finalQuestionsArray.push({

            Question_Text: el.querySelector(".edit-qtext")?.value ?? "",

            Option_A: el.querySelector(".edit-optA")?.value ?? "",

            Option_B: el.querySelector(".edit-optB")?.value ?? "",

            Option_C: el.querySelector(".edit-optC")?.value ?? "",

            Option_D: el.querySelector(".edit-optD")?.value ?? "",

            Correct_Answer: ans

        });

    });



    return finalQuestionsArray;

}



/**

 * Renders the clean quiz editor interface inside the respective chapter preview panel.

 * Supports up to 10 questions max based on your system design requirements.

 *

 * @param {Array} backendQuestions - Array of question objects from your NLP RAG model.

 * @param {HTMLElement} containerTarget - The DOM element where the preview HTML should build.

 */

function renderCleanQuizPreview(backendQuestions, containerTarget) {

    if (!backendQuestions || !Array.isArray(backendQuestions)) {

        console.error("❌ Invalid array format for quiz questions.");

        containerTarget.innerHTML = `

            <div style="color: #e74c3c; padding: 15px; background: #fde8e8; border-radius: 6px;">

                <i class="fa-solid fa-circle-exclamation"></i> Error: Invalid questions data received.

            </div>

        `;

        return;

    }



    if (backendQuestions.length === 0) {

        console.warn("⚠️ No questions to render.");

        containerTarget.innerHTML = `

            <div style="color: #f39c12; padding: 15px; background: #fef9e7; border-radius: 6px;">

                <i class="fa-solid fa-info-circle"></i> No questions generated. Please try again.

            </div>

        `;

        return;

    }



    console.log(`✅ Rendering ${backendQuestions.length} questions (clean preview)...`);



    const questionsToRender = backendQuestions.slice(0, GOOGLE_FORM_QUIZ_MAX_QUESTIONS);

    let generatedHtml = "";



    questionsToRender.forEach((q, index) => {

        const { questionText, optA, optB, optC, optD, correctAnswer } = normalizeQuestionFields(q);

        const questionNumber = index + 1;



        generatedHtml += `

            <div class="single-question-item" data-index="${index}" style="background-color: #FFFFFF; border: 1px solid #B3CFE5; border-radius: 8px; padding: 20px; margin-bottom: 20px; transition: border-color 0.3s ease;">

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">

                    <span style="font-weight: 700; color: #0A1931; font-size: 14px; text-transform: uppercase; background: #B3CFE5; padding: 4px 12px; border-radius: 4px;">

                        Question ${questionNumber}

                    </span>

                    <span style="color: #4A7FA7; font-size: 12px;">

                        <i class="fa-solid fa-pen-to-square"></i> Editable

                    </span>

                </div>

                <div style="margin-bottom: 15px;">

                    <label style="display: block; font-size: 13px; font-weight: 600; color: #1A3D63; margin-bottom: 6px;">

                        <i class="fa-regular fa-circle-question"></i> Question Prompt

                    </label>

                    <textarea class="edit-qtext" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 10px; font-size: 14px; color: #0A1931; font-family: inherit; resize: vertical; box-sizing: border-box;" rows="2">${escapeHtml(questionText)}</textarea>

                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">

                    <div>

                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">A.</label>

                        <input type="text" class="edit-optA" value="${escapeHtml(optA)}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">

                    </div>

                    <div>

                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">B.</label>

                        <input type="text" class="edit-optB" value="${escapeHtml(optB)}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">

                    </div>

                    <div>

                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">C.</label>

                        <input type="text" class="edit-optC" value="${escapeHtml(optC)}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">

                    </div>

                    <div>

                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">D.</label>

                        <input type="text" class="edit-optD" value="${escapeHtml(optD)}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">

                    </div>

                </div>

                <div style="background-color: #F6FAFD; padding: 10px 15px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid #1A3D63;">

                    <label style="font-size: 13px; font-weight: 600; color: #1A3D63;">

                        <i class="fa-solid fa-check-circle"></i> Correct Answer:

                    </label>

                    <select class="edit-correct" style="padding: 5px 12px; border: 1px solid #B3CFE5; border-radius: 4px; background-color: #FFFFFF; color: #0A1931; font-weight: bold; cursor: pointer;">

                        <option value="A" ${correctAnswer === "A" ? "selected" : ""}>Option A</option>

                        <option value="B" ${correctAnswer === "B" ? "selected" : ""}>Option B</option>

                        <option value="C" ${correctAnswer === "C" ? "selected" : ""}>Option C</option>

                        <option value="D" ${correctAnswer === "D" ? "selected" : ""}>Option D</option>

                    </select>

                </div>

            </div>

        `;

    });



    generatedHtml += `

        <div style="text-align: center; margin-top: 20px; padding: 15px; background: #F6FAFD; border-top: 1px solid #B3CFE5; border-radius: 0 0 8px 8px;">

            <button type="button" class="btn-confirm-chapter-quiz" style="background-color: #2ecc71; color: white; border: none; padding: 12px 35px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: background 0.3s ease;">

                <i class="fa-solid fa-lock"></i> Confirm & Lock Quiz (${questionsToRender.length} Questions)

            </button>

            <p style="font-size: 12px; color: #999; margin-top: 8px;">

                <i class="fa-solid fa-info-circle"></i> Review and edit questions above before confirming.

            </p>

        </div>

    `;



    containerTarget.innerHTML = generatedHtml;

    console.log(`✅ Quiz preview rendered with ${questionsToRender.length} questions!`);

}


