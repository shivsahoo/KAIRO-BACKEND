# AI Training Guide - Sarah (HR Manager) Persona

## ✅ Training Complete

Sarah Chen has been trained as an experienced HR Manager with the following characteristics:

### **Personality & Communication Style**
- Professional but approachable and supportive
- Direct and clear communication
- Experienced mentor who guides without micromanaging
- Uses real-world HR scenarios and examples
- Asks probing questions to develop critical thinking
- Natural conversation flow (not robotic)

### **Knowledge & Expertise**
- Deep understanding of HR policies, employment law, and best practices
- Experience with recruitment, employee relations, conflict resolution, and policy development
- Knowledge of workplace dynamics and organizational behavior
- Familiar with common HR challenges and how to handle them professionally

### **How Sarah Generates Responses**

1. **System Prompt**: Comprehensive training instructions that define Sarah's role, personality, and expertise
2. **Task Context**: Each response considers the current task context (title, description, expected output)
3. **Conversation History**: Uses last 10 messages to maintain context
4. **Dynamic Scenarios**: Generates realistic HR scenarios based on the task

### **Initial Message Generation**

When a simulation starts, Sarah generates contextually appropriate welcome messages:

- **Task 1 (Job Description)**: Introduces task naturally, explains why it's important
- **Task 2 (Resume Screening)**: Creates urgency around deadline, explains what to look for
- **Task 3 (Conflict Resolution)**: Describes the conflict scenario with specific details
- **Task 4 (HR Policy)**: Explains strategic need for the policy, considers stakeholders

### **Response Generation Settings**

- **Model**: GPT-4 Turbo Preview
- **Temperature**: 0.85 (natural, conversational)
- **Max Tokens**: 700 (allows for detailed responses)
- **Presence Penalty**: 0.3 (encourages variety)
- **Frequency Penalty**: 0.2 (reduces repetition)

### **Example Conversation Flow**

**User**: "Hello, I'm ready to start"

**Sarah (AI-generated)**: 
> "Good morning! Welcome to the team. I have your first assignment ready - we need to draft a Job Description for an HR Intern position. This is a great starting point because it'll help you understand how we structure roles here. 

> We're looking to hire someone who can support our recruitment efforts and learn the ropes. What key responsibilities do you think should be included in this JD?"

### **Key Features**

1. ✅ **No Hardcoded Messages**: All messages are AI-generated based on context
2. ✅ **Context-Aware**: Responses consider current task and conversation history
3. ✅ **Realistic Scenarios**: Creates believable workplace situations
4. ✅ **Educational**: Guides learning through questions, not answers
5. ✅ **Natural Language**: Conversations feel authentic, not scripted

### **How to Test**

1. Make sure `OPENAI_API_KEY` is set in `.env` file
2. Start backend: `npm run dev` in `KAIRO-BACKEND`
3. Start frontend: `npm run dev` in `KAIRO-FRONTEND`
4. Select "HR Executive" role
5. Observe Sarah's initial message - it will be unique and context-aware every time

### **Troubleshooting**

**If you see hardcoded messages:**
- Check that `OPENAI_API_KEY` is set in backend `.env`
- Check backend logs for AI generation errors
- Ensure backend is using `generatePersonaResponse()` function

**If responses seem generic:**
- The system prompt might need adjustment
- Check that task context is being passed correctly
- Verify OpenAI API is responding (check logs)

### **Customization**

To adjust Sarah's personality or expertise, edit the system prompt in:
`KAIRO-BACKEND/src/services/ai.orchestrator.js` → `getPersonaSystemPrompt()` function

### **Future Enhancements**

- Fine-tune GPT model with HR-specific training data
- Add more persona variations (different manager styles)
- Implement memory of previous simulations
- Add multi-turn conversation planning

