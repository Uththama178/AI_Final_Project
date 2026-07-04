/**
 * Renders the clean quiz editor interface inside the respective chapter preview panel.
 * Supports up to 10 questions max based on your system design requirements.
 * 
 * @param {Array} backendQuestions - Array of question objects from your NLP RAG model.
 * @param {HTMLElement} containerTarget - The DOM element where the preview HTML should build.
 */
function renderCleanQuizPreview(backendQuestions, containerTarget) {
    if (!backendQuestions || !Array.isArray(backendQuestions)) {
        console.error("Invalid array format for quiz questions.");
        return;
    }

    // Limit to a maximum of 10 questions to maintain structure
    const questionsToRender = backendQuestions.slice(0, 10);
    let generatedHtml = "";

    questionsToRender.forEach((q, index) => {
        // Safe extractions matching your database models.py naming conventions exactly
        const questionText = q.Question_Text || q.question_text || "";
        const optA = q.Option_A || q.option_a || "";
        const optB = q.Option_B || q.option_b || "";
        const optC = q.Option_C || q.option_c || "";
        const optD = q.Option_D || q.option_d || "";
        const correctAnswer = (q.Correct_Answer || q.correct_answer || "A").toUpperCase().trim();

        // 🌟 FIXED: dashboard_teacher.js එකේ querySelector වලට ගැලපෙන්න single-question-item සහ edit-* classes ඇතුළත් කර ඇත.
        generatedHtml += `
            <div class="question-card-item single-question-item" data-index="${index}" style="background-color: #FFFFFF; border: 1px solid #B3CFE5; border-radius: 8px; padding: 20px; margin-bottom: 20px; transition: border-color 0.3s ease;">
                
                <!-- Card Header Info -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span style="font-weight: 700; color: #0A1931; font-size: 14px; text-transform: uppercase; background: #B3CFE5; padding: 3px 10px; border-radius: 4px;">Question 0${index + 1}</span>
                    <span style="color: #4A7FA7; font-size: 12px;"><i class="fa-solid fa-pen-to-square"></i> Editable Field</span>
                </div>

                <!-- Main Input Question Field -->
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: #1A3D63; margin-bottom: 6px;">Question Prompt Text</label>
                    <textarea class="edit-qtext" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 10px; font-size: 14px; color: #0A1931; font-family: inherit; resize: vertical; box-sizing: border-box;" rows="2">${questionText}</textarea>
                </div>

                <!-- MCQ Options Fields Grid Structure (2x2 Display) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">Option A</label>
                        <input type="text" class="edit-optA" value="${optA}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">Option B</label>
                        <input type="text" class="edit-optB" value="${optB}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">Option C</label>
                        <input type="text" class="edit-optC" value="${optC}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: #4A7FA7;">Option D</label>
                        <input type="text" class="edit-optD" value="${optD}" style="width: 100%; border: 1px solid #B3CFE5; border-radius: 6px; padding: 8px 10px; box-sizing: border-box; font-size: 13px; color: #0A1931;">
                    </div>
                </div>

                <!-- Correct Target Answer Selector -->
                <div style="background-color: #F6FAFD; padding: 10px 15px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid #1A3D63;">
                    <label style="font-size: 13px; font-weight: 600; color: #1A3D63;">Set Designated Correct Key Answer:</label>
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

    // 🌟 New: Injecting the missing Confirm & Lock button container at the end of the list
    generatedHtml += `
        <div style="text-align: right; margin-top: 20px; padding: 15px; background: #F6FAFD; border-top: 1px solid #B3CFE5; border-radius: 0 0 8px 8px;">
            <button type="button" class="btn-confirm-chapter-quiz" style="background-color: #2ecc71; color: white; border: none; padding: 10px 22px; font-size: 14px; font-weight: 600; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: background 0.2s;">
                <i class="fa-solid fa-lock"></i> Confirm & Lock Quiz
            </button>
        </div>
    `;

    // Inject compiled template into targeted placeholder container
    containerTarget.innerHTML = generatedHtml;
}