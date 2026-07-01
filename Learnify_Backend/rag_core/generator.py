import os
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

# 🆕 ඔයාගේ AI Model එක සේව් කරන ෆෝල්ඩර් පාත් එක
MODEL_PATH = "saved_models/learnify_t5"
quiz_pipeline = None

# ෆෝල්ඩර් එක තිබේ නම් පමණක් සැබෑ Hugging Face Pipeline එක Load කරයි
if os.path.exists(MODEL_PATH):
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_PATH)
        quiz_pipeline = pipeline("text2text-generation", model=model, tokenizer=tokenizer)
        print("🤖 AI Model successfully loaded into Learnify Backend!")
    except Exception as e:
        print(f"⚠️ Model Loading Error: {str(e)}")

def generate_mcqs_from_context(context: str, chapter_title: str) -> list[dict]:
    """
    Kaggle හරහා ට්‍රේන් කරන ලද T5/BART මොඩල් එක භාවිතයෙන් සැබෑ MCQ ප්‍රශ්න සාදා දීම.
    මොඩල් එක නැතිනම් Fallback එකක් ලෙස සාමාන්‍ය ප්‍රශ්න ලබා දේ.
    """
    
    # 🔥 1. AI මොඩල් එක තවම නැතිනම් පෙන්වන සුපුරුදු Dummy ප්‍රශ්න ටික
    if quiz_pipeline is None:
        return [
            {
                "Question_Text": f"Based on the course materials provided for '{chapter_title}', what is the primary structural concept discussed?",
                "Option_A": "Architectural Component Protocol",
                "Option_B": "Foundational Logic Framework",
                "Option_C": "System Integration Mechanism",
                "Option_D": "Abstract Virtual Processing",
                "Correct_Answer": "A"
            },
            {
                "Question_Text": f"According to the lecture video and PDF text, which core rule must be verified for '{chapter_title}'?",
                "Option_A": "Manual Optimization Process",
                "Option_B": "Automated Constraints Validation",
                "Option_C": "Legacy Deployment Architecture",
                "Option_D": "Redundant Structural Schema",
                "Correct_Answer": "B"
            }
        ]
        
    # 🔥 2. සැබෑ AI Inference (මොඩල් එක ඇති විට ක්‍රියාත්මක වන කොටස)
    try:
        # T5 එකට Prompt එක සකස් කිරීම
        input_text = f"generate mcq: context: {context} topic: {chapter_title}"
        
        # AI එකෙන් ප්‍රශ්න ජෙනරේට් කිරීම
        ai_output = quiz_pipeline(input_text, max_length=256, num_return_sequences=1)
        generated_text = ai_output[0]['generated_text']
        
        # [NOTE] ඔයා Kaggle එකේ මොඩල් එක Train කරන විදිහ අනුව එන Text එක Split කරගන්න:
        # උදාහරණයක් ලෙස: "Question Text?|Opt A|Opt B|Opt C|Opt D|CorrectAns" ලෙස එන්නේ නම්:
        parts = generated_text.split("|")
        if len(parts) >= 6:
            return [{
                "Question_Text": parts[0].strip(),
                "Option_A": parts[1].strip(),
                "Option_B": parts[2].strip(),
                "Option_C": parts[3].strip(),
                "Option_D": parts[4].strip(),
                "Correct_Answer": parts[5].strip().upper()
            }]
            
    except Exception as e:
        print(f"AI Generation Error: {str(e)}")
        
    # මොඩල් එකේ මොනවා හරි අවුලක් වුණොත් සිස්ටම් එක ක්‍රෑෂ් වෙන්නේ නැති වෙන්න දෙන Fallback එක
    return [{"Question_Text": "Reviewing content... (AI Output Parsing Error)", "Option_A": "Retry", "Option_B": "N/A", "Option_C": "N/A", "Option_D": "N/A", "Correct_Answer": "A"}]