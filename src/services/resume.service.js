import Resume from '../models/Resume.model.js';
import { aiClient, provider } from '../config/ai.config.js';

/**
 * Generate a single resume using AI
 */
async function generateSingleResume(quality, position = 'Python Developer', techStack = 'Python') {
  // Tech stack specific skills
  const techSkills = {
    Python: ['Python', 'Django', 'Flask', 'FastAPI', 'SQL', 'Git', 'REST APIs', 'PostgreSQL', 'MongoDB'],
    Java: ['Java', 'Spring Boot', 'Hibernate', 'Maven', 'MySQL', 'REST APIs'],
    JavaScript: ['JavaScript', 'React', 'Node.js', 'Express', 'MongoDB', 'TypeScript'],
    Other: ['C++', 'C#', 'PHP', 'Ruby', 'Go'],
  };

  const skills = techSkills[techStack] || techSkills.Python;
  
  const qualityPrompts = {
    excellent: `Create an excellent resume for a candidate applying for ${position}. The candidate should have:
- 4-6 years of relevant ${techStack} development experience
- Strong educational background (Bachelor's or Master's in Computer Science/Engineering)
- Expert-level skills in: ${skills.join(', ')}
- Impressive work history with quantifiable achievements (projects, contributions, impact)
- Professional summary highlighting ${techStack} expertise
- No gaps or red flags
- Experience with modern development practices (CI/CD, testing, code reviews)
Make it realistic and compelling.`,
    
    good: `Create a good resume for a candidate applying for ${position}. The candidate should have:
- 2-4 years of relevant ${techStack} development experience
- Good educational background (Bachelor's in CS/Engineering or related)
- Strong skills in: ${skills.slice(0, 5).join(', ')}
- Solid work history with some achievements
- Some ${techStack} projects and contributions
- Minor gaps or issues are acceptable
Make it realistic.`,
    
    average: `Create an average resume for a candidate applying for ${position}. The candidate should have:
- 1-2 years of experience (may be limited or mixed tech stack)
- Basic educational background
- Basic skills in: ${skills.slice(0, 3).join(', ')}
- Limited work history
- Few projects or achievements
- May have some gaps or inconsistencies
- May not be primarily ${techStack} focused
Make it realistic.`,
    
    poor: `Create a poor resume for a candidate applying for ${position}. The candidate should have:
- Limited or no relevant ${techStack} experience
- Weak educational background or unrelated degree
- Missing or irrelevant skills (no ${techStack} experience)
- Poor work history or gaps
- No significant ${techStack} projects
- Multiple red flags (typos, inconsistencies, etc.)
- Clearly not suitable for ${position} role
Make it realistic but clearly not suitable.`,
  };

  const prompt = qualityPrompts[quality] || qualityPrompts.average;

  if (!aiClient) {
    // Return mock resume if AI not available
    return generateMockResume(quality, position, techStack);
  }

  try {
    const systemPrompt = `You are a resume generator. Create realistic, detailed resumes in JSON format. Include all standard resume sections.`;

    const userPrompt = `${prompt}

Return a JSON object with this exact structure:
{
  "candidateName": "Full Name",
  "email": "email@example.com",
  "phone": "+1-234-567-8900",
  "experience": <number of years>,
  "skills": ["skill1", "skill2", ...],
  "education": "Degree and University",
  "summary": "Professional summary paragraph",
  "workHistory": [
    {
      "company": "Company Name",
      "position": "Job Title",
      "duration": "MM/YYYY - MM/YYYY",
      "description": "Job description with achievements"
    }
  ],
  "quality": "${quality}",
  "relevance": <number 1-10>,
  "resumeText": "Full formatted resume text"
}`;

    if (provider === 'openai') {
      const response = await aiClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } else if (provider === 'anthropic') {
      const response = await aiClient.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });

      const result = JSON.parse(response.content[0].text);
      return result;
    }
    } catch (error) {
      console.error('Error generating resume:', error);
      return generateMockResume(quality, position, techStack);
    }
}

/**
 * Generate mock resume (fallback)
 */
function generateMockResume(quality, position) {
  const names = ['John Smith', 'Sarah Johnson', 'Michael Chen', 'Emily Davis', 'David Wilson'];
  const emails = ['john.smith@email.com', 'sarah.j@email.com', 'mchen@email.com', 'emily.d@email.com', 'dwilson@email.com'];
  const randomIndex = Math.floor(Math.random() * names.length);

  return {
    candidateName: names[randomIndex],
    email: emails[randomIndex],
    phone: `+1-555-${Math.floor(Math.random() * 9000) + 1000}`,
    experience: quality === 'excellent' ? 5 : quality === 'good' ? 3 : quality === 'average' ? 2 : 0,
    skills: quality === 'excellent' ? ['HR Management', 'Recruitment', 'Employee Relations', 'HRIS', 'Analytics'] : 
            quality === 'good' ? ['Recruitment', 'HR Basics', 'Communication'] : 
            quality === 'average' ? ['Basic HR', 'Microsoft Office'] : ['None'],
    education: quality === 'excellent' ? 'Bachelor of Business Administration, HR Management' : 
               quality === 'good' ? 'Bachelor of Arts, Business' : 
               quality === 'average' ? 'Associate Degree' : 'High School Diploma',
    summary: `Experienced ${quality} candidate seeking ${position} position.`,
    workHistory: [],
    quality: quality,
    relevance: quality === 'excellent' ? 9 : quality === 'good' ? 7 : quality === 'average' ? 5 : 2,
    resumeText: `Resume for ${names[randomIndex]} - ${quality} candidate`,
  };
}

/**
 * Generate 10 resumes for a simulation session
 */
export async function generateResumesForTask(simulationId) {
  // Check if resumes already exist
  const existingResumes = await Resume.find({ simulationId });
  if (existingResumes.length >= 10) {
    return existingResumes;
  }

  // Generate 10 resumes with varying quality
  // Distribution: 2 excellent, 3 good, 3 average, 2 poor
  const qualityDistribution = [
    'excellent', 'excellent',
    'good', 'good', 'good',
    'average', 'average', 'average',
    'poor', 'poor',
  ];

  // Shuffle the distribution for randomness
  const shuffled = qualityDistribution.sort(() => Math.random() - 0.5);

  const resumes = [];
  const position = 'HR Intern'; // Position for the job opening

  console.log(`📄 Generating 10 resumes for simulation ${simulationId}...`);

  for (let i = 0; i < 10; i++) {
    try {
      const resumeData = await generateSingleResume(shuffled[i], position);
      
      const resume = await Resume.create({
        simulationId,
        ...resumeData,
      });

      resumes.push(resume);
      console.log(`✅ Generated resume ${i + 1}/10: ${resume.candidateName} (${resume.quality})`);
    } catch (error) {
      console.error(`Error generating resume ${i + 1}:`, error);
      // Create a fallback resume
      const fallback = generateMockResume(shuffled[i], position);
      const resume = await Resume.create({
        simulationId,
        ...fallback,
      });
      resumes.push(resume);
    }
  }

  console.log(`✅ Successfully generated ${resumes.length} resumes`);
  return resumes;
}

/**
 * Generate shared resumes (common for all users) - called on app startup
 * For Python Developer position: 3 good Python resumes, 2 other tech, 5 mixed quality
 */
export async function generateSharedResumes() {
  // Check if shared resumes already exist
  const existingResumes = await Resume.find({ isShared: true });
  if (existingResumes.length >= 10) {
    console.log(`✅ ${existingResumes.length} shared resumes already exist`);
    return existingResumes;
  }

  // Calculate how many to generate
  const needed = 10 - existingResumes.length;
  console.log(`📄 Generating ${needed} shared resumes for Python Developer position (${existingResumes.length} already exist)...`);

  // Resume distribution for Python Developer:
  // 3 good Python developers, 2 other tech stack, 5 mixed (excellent/average/poor)
  const resumeSpecs = [
    { quality: 'good', techStack: 'Python', position: 'Python Developer' },
    { quality: 'good', techStack: 'Python', position: 'Python Developer' },
    { quality: 'good', techStack: 'Python', position: 'Python Developer' },
    { quality: 'good', techStack: 'Java', position: 'Java Developer' },
    { quality: 'good', techStack: 'JavaScript', position: 'Full Stack Developer' },
    { quality: 'excellent', techStack: 'Python', position: 'Senior Python Developer' },
    { quality: 'average', techStack: 'Python', position: 'Python Developer' },
    { quality: 'average', techStack: 'Other', position: 'Software Developer' },
    { quality: 'poor', techStack: 'Python', position: 'Python Developer' },
    { quality: 'poor', techStack: 'Other', position: 'Developer' },
  ];

  const resumes = [];
  const position = 'Python Developer'; // Main position for the job opening

  // Generate only the needed resumes
  for (let i = 0; i < needed; i++) {
    try {
      const specIndex = (existingResumes.length + i) % resumeSpecs.length;
      const spec = resumeSpecs[specIndex];
      
      // Generate resume with specific tech stack
      const resumeData = await generateSingleResume(spec.quality, spec.position, spec.techStack);
      
      const resume = await Resume.create({
        isShared: true,
        ...resumeData,
      });

      resumes.push(resume);
      console.log(`✅ Generated shared resume ${existingResumes.length + i + 1}/10: ${resume.candidateName} (${resume.quality}, ${spec.techStack})`);
    } catch (error) {
      console.error(`Error generating resume ${i + 1}:`, error);
      // Create a fallback resume
      const specIndex = (existingResumes.length + i) % resumeSpecs.length;
      const spec = resumeSpecs[specIndex];
      const fallback = generateMockResume(spec.quality, spec.position, spec.techStack);
      const resume = await Resume.create({
        isShared: true,
        ...fallback,
      });
      resumes.push(resume);
    }
  }

  const totalResumes = existingResumes.length + resumes.length;
  console.log(`✅ Successfully generated ${resumes.length} shared resumes. Total: ${totalResumes}/10`);
  
  return [...existingResumes, ...resumes];
}

/**
 * Initialize shared resumes on app startup
 */
export async function initializeSharedResumes() {
  try {
    const resumes = await Resume.find({ isShared: true });
    if (resumes.length < 10) {
      console.log(`📄 Initializing shared resumes (${resumes.length}/10 exist)...`);
      await generateSharedResumes();
    } else {
      console.log(`✅ Shared resumes already initialized (${resumes.length} resumes)`);
    }
  } catch (error) {
    console.error('Error initializing shared resumes:', error);
  }
}

/**
 * Get shared resumes (common for all users)
 */
export async function getSharedResumes() {
  const resumes = await Resume.find({ isShared: true }).sort({ createdAt: 1 });
  return resumes;
}

/**
 * Get resumes for a simulation session - now uses shared resumes
 */
export async function getResumesForTask(simulationId) {
  // Use shared resumes instead of session-specific
  const resumes = await getSharedResumes();
  return resumes;
}

