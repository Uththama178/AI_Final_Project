/**
 * Renders the clean quiz editor interface inside the respective chapter preview panel.
 * Supports up to 10 questions max based on your system design requirements.
 * 
 * @param {Array} backendQuestions - Array of question objects from your NLP RAG model.
 * @param {HTMLElement} containerTarget - The DOM element where the preview HTML should build.
 */
function renderCleanQuizPreview(backendQuestions, containerTarget) {
    // Validate input
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

    console.log(`✅ Rendering ${backendQuestions.length} questions...`);

    // Limit to a maximum of 10 questions to maintain structure
    const questionsToRender = backendQuestions.slice(0, 10);
    let generatedHtml = "";

    // Generate HTML for each question
    questionsToRender.forEach((q, index) => {
        // Safe extractions with fallbacks
        const questionText = q.Question_Text || q.question_text || q.Question || "";
        const optA = q.Option_A || q.option_a || q.OptionA || "";
        const optB = q.Option_B || q.option_b || q.OptionB || "";
        const optC = q.Option_C || q.option_c || q.OptionC || "";
        const optD = q.Option_D || q.option_d || q.OptionD || "";
        const correctAnswer = (q.Correct_Answer || q.correct_answer || q.Correct || "A").toString().toUpperCase().trim();

        // Ensure correct answer is A, B, C, or D
        const validAnswers = ["A", "B", "C", "D"];
        const selectedAnswer = validAnswers.includes(correctAnswer) ? correctAnswer : "A";

        const questionNumber = index + 1;

        generatedHtml += `
            <div class="single-question-item" data-index="${index}" style="background-color: #FFFFFF; border: 1px solid #B3CFE5; border-radius: 8px; padding: 20px; margin-bottom: 20px; transition: border-color 0.3s ease;">
                
                <!-- Question Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span style="font-weight: 700; color: #0A1931; font-size: 14px; text-transform: uppercase; background: #B3CFE5; padding: 4px 12px; border-radius: 4px;">
                        Question ${questionNumber}
                    </span>
                    <span style="color: #4A7FA7; font-size: 12px;">
                        <i class="fa-solid fa-pen-to-square"></i> Editable
                    </span>
                </div>

                <!-- Question Text -->
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #1A3D63; margin-bottom: 6px;">
                        <i class="fa-regular fa-circle-question"></i> Question Prompt
                    </label>
                    <textarea class="edit-qtext" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 10px; font-size: 14px; color: #0A1931; font-family: inherit; resize: vertical; box-sizing: border-box;" rows="2">${escapeHtml(questionText)}</textarea>
                </div>

                <!-- Options Grid -->
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

                <!-- Correct Answer Selector -->
                <div style="background-color: #F6FAFD; padding: 10px 15px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid #1A3D63;">
                    <label style="font-size: 13px; font-weight: 600; color: #1A3D63;">
                        <i class="fa-solid fa-check-circle"></i> Correct Answer:
                    </label>
                    <select class="edit-correct" style="padding: 5px 12px; border: 1px solid #B3CFE5; border-radius: 4px; background-color: #FFFFFF; color: #0A1931; font-weight: bold; cursor: pointer;">
                        <option value="A" ${selectedAnswer === "A" ? "selected" : ""}>Option A</option>
                        <option value="B" ${selectedAnswer === "B" ? "selected" : ""}>Option B</option>
                        <option value="C" ${selectedAnswer === "C" ? "selected" : ""}>Option C</option>
                        <option value="D" ${selectedAnswer === "D" ? "selected" : ""}>Option D</option>
                    </select>
                </div>
            </div>
        `;
    });

    // Add Confirm Button at the bottom
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

    // Inject into container
    containerTarget.innerHTML = generatedHtml;
    console.log(`✅ Quiz preview rendered with ${questionsToRender.length} questions!`);
}

/**
 * Escape HTML to prevent XSS attacks
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