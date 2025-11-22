// HR Track Task Skeleton - EXACT as specified
export const HR_TASKS = [
  {
    id: 'hr_t1',
    level: 'beginner',
    title: 'Write a Job Description for an HR Intern',
    description: 'Draft a clear JD including responsibilities, skills, and qualifications.',
    expectedOutput: 'A structured JD in text or DOCX/PDF',
  },
  {
    id: 'hr_t2',
    level: 'beginner',
    title: 'Screen 10 resumes & shortlist top 3 candidates',
    description: 'Review provided resumes and justify your selection.',
    expectedOutput: 'Shortlist + justification',
  },
  {
    id: 'hr_t3',
    level: 'intermediate',
    title: 'Schedule Interviews (Calendar + Mail)',
    description: 'Schedule 1 interview with a candidate. Pick a time slot, create calendar invite, and send email with meeting link and resume.',
    expectedOutput: '1 scheduled calendar event + 1 sent email',
  },
  {
    id: 'hr_t4',
    level: 'advanced',
    title: 'Conduct Mock HR Call (HR Interview)',
    description: 'Conduct a realistic voice screening call with a candidate for a Software Developer role. AI will act as the candidate and respond naturally.',
    expectedOutput: 'Call transcript with your questions, candidate responses, and your evaluation notes',
  },
];

/**
 * Get task by ID
 */
export function getTaskById(taskId) {
  return HR_TASKS.find(task => task.id === taskId);
}

/**
 * Get task by index
 */
export function getTaskByIndex(index) {
  return HR_TASKS[index] || null;
}

/**
 * Get all tasks
 */
export function getAllTasks() {
  return HR_TASKS;
}

/**
 * Get current task for simulation
 */
export function getCurrentTask(taskIndex) {
  if (taskIndex >= HR_TASKS.length) {
    return null; // All tasks completed
  }
  return HR_TASKS[taskIndex];
}

/**
 * Check if task exists
 */
export function taskExists(taskId) {
  return HR_TASKS.some(task => task.id === taskId);
}

/**
 * Get next task index
 */
export function getNextTaskIndex(currentIndex) {
  return currentIndex + 1;
}

