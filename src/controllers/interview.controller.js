import SimulationSession from '../models/SimulationSession.model.js';
import InterviewSchedule from '../models/InterviewSchedule.model.js';
import Email from '../models/Email.model.js';
import Resume from '../models/Resume.model.js';
import { getCurrentTask } from '../services/task.service.js';
import { generatePersonaResponse } from '../services/ai.orchestrator.js';
import { getSocketInstance } from '../utils/socket.instance.js';

/**
 * Get candidates for hr_t3
 */
export const getCandidates = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Get current task
    const currentTask = getCurrentTask(session.currentTaskIndex);
    if (!currentTask || currentTask.id !== 'hr_t3') {
      return res.status(400).json({ message: 'Current task is not hr_t3' });
    }

    // Get candidates from shared resumes (prefer good/excellent quality)
    const { getSharedResumes } = await import('../services/resume.service.js');
    const resumes = await getSharedResumes();
    
    // Select 4-5 candidates for interviews
    const candidates = resumes
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 5)
      .map(resume => ({
        id: resume._id.toString(),
        candidateName: resume.candidateName,
        email: resume.email,
        phone: resume.phone,
        experience: resume.experience,
        skills: resume.skills,
        education: resume.education,
        summary: resume.summary,
        resumeText: resume.resumeText,
      }));

    res.json({
      candidates,
      count: candidates.length,
    });
  } catch (error) {
    console.error('Get candidates error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get available time slots
 */
export const getAvailableTimeSlots = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query; // Optional: specific date

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Generate available time slots for the next 2 weeks
    const slots = [];
    const startDate = date ? new Date(date) : new Date();
    startDate.setHours(0, 0, 0, 0);
    
    // Business hours: 9 AM - 6 PM
    const businessHours = { start: 9, end: 18 };
    const slotDuration = 60; // 60 minutes per slot
    
    for (let day = 0; day < 14; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);
      
      // Skip weekends (optional, can be configured)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      for (let hour = businessHours.start; hour < businessHours.end; hour++) {
        const slotStart = new Date(currentDate);
        slotStart.setHours(hour, 0, 0, 0);
        
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);
        
        // Check if this slot is already booked
        const existingInterview = await InterviewSchedule.findOne({
          simulationId: session._id,
          taskId: 'hr_t3',
          startTime: { $lt: slotEnd },
          endTime: { $gt: slotStart },
          status: { $nin: ['cancelled', 'declined'] },
        });
        
        if (!existingInterview) {
          slots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            date: currentDate.toISOString().split('T')[0],
            time: `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`,
            available: true,
          });
        }
      }
    }

    res.json({
      slots,
      count: slots.length,
    });
  } catch (error) {
    console.error('Get available time slots error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Create interview schedule
 */
export const createInterviewSchedule = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      candidateId,
      resumeId, // Optional: Resume to attach in emails (from shared resumes list)
      startTime,
      endTime,
      title,
      description,
      interviewType,
      location,
      meetingLink, // REQUIRED for evaluation
    } = req.body;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Get current task
    const currentTask = getCurrentTask(session.currentTaskIndex);
    if (!currentTask || currentTask.id !== 'hr_t3') {
      return res.status(400).json({ message: 'Current task is not hr_t3' });
    }

    // Validate candidate exists
    const candidate = await Resume.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    // Validate meeting link is provided (REQUIRED for evaluation)
    if (!meetingLink || typeof meetingLink !== 'string' || meetingLink.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Meeting link is required for interview scheduling. Please provide a valid meeting link (e.g., https://meet.company.com/interview/123456).' 
      });
    }

    // Validate resume exists if provided (optional, defaults to candidateId)
    let resumeToAttach = candidate; // Default to candidate's resume
    if (resumeId) {
      const selectedResume = await Resume.findById(resumeId);
      if (!selectedResume) {
        return res.status(404).json({ message: 'Selected resume not found' });
      }
      resumeToAttach = selectedResume;
    }

    // Validate time slot
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (start >= end) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    if (start < new Date()) {
      return res.status(400).json({ message: 'Cannot schedule interview in the past' });
    }

    // Check for conflicts with existing interviews
    const conflict = await InterviewSchedule.findOne({
      simulationId: session._id,
      taskId: 'hr_t3',
      startTime: { $lt: end },
      endTime: { $gt: start },
      status: { $nin: ['cancelled', 'declined'] },
    });

    if (conflict) {
      return res.status(400).json({
        message: 'Time slot is already booked',
        conflict: {
          id: conflict._id.toString(),
          candidateName: conflict.candidateName,
          startTime: conflict.startTime,
          endTime: conflict.endTime,
        },
      });
    }

    // Create interview schedule
    const interview = await InterviewSchedule.create({
      simulationId: session._id,
      taskId: 'hr_t3',
      userId,
      candidateId: candidate._id,
      resumeId: resumeToAttach._id, // Store resume to attach in emails
      candidateName: candidate.candidateName,
      candidateEmail: candidate.email,
      interviewerName: 'Sarah Chen (HR Manager)',
      interviewType: interviewType || 'video',
      title: title || 'Interview - Python Developer Position',
      description: description || `Interview with ${candidate.candidateName} for Python Developer position`,
      startTime: start,
      endTime: end,
      duration: Math.round((end - start) / (1000 * 60)), // in minutes
      location: location || null,
      meetingLink: meetingLink.trim(), // REQUIRED - must be provided
      status: 'scheduled',
    });

    res.status(201).json({
      interview: {
        id: interview._id.toString(),
        candidateId: interview.candidateId.toString(),
        resumeId: interview.resumeId?.toString() || interview.candidateId.toString(), // Resume to attach
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail,
        title: interview.title,
        description: interview.description,
        startTime: interview.startTime,
        endTime: interview.endTime,
        duration: interview.duration,
        interviewType: interview.interviewType,
        location: interview.location,
        meetingLink: interview.meetingLink,
        status: interview.status,
        createdAt: interview.createdAt,
      },
      message: 'Interview scheduled successfully',
    });
  } catch (error) {
    console.error('Create interview schedule error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Send interview invitation email to candidate and interviewer
 */
export const sendInterviewEmail = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      interviewId,
      meetingLink, // REQUIRED: Meeting link for the interview
      resumeId, // REQUIRED: Resume ID to attach in emails (from shared resumes list)
      candidateEmail, // REQUIRED: Candidate email address to send to
      interviewerEmail, // REQUIRED: Interviewer email address to send to
      subject,
      body,
      attachResume,
    } = req.body;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Get interview schedule
    const interview = await InterviewSchedule.findById(interviewId)
      .populate('candidateId')
      .populate('resumeId');
    
    if (!interview) {
      return res.status(404).json({ message: 'Interview schedule not found' });
    }

    if (interview.simulationId.toString() !== session._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized access to interview' });
    }

    // Validate only candidateEmail and interviewerEmail (needed to send emails)
    if (!candidateEmail || typeof candidateEmail !== 'string' || candidateEmail.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Candidate email is required. Please provide the candidate email address to send the invitation to.' 
      });
    }

    if (!interviewerEmail || (typeof interviewerEmail !== 'string' && typeof interviewerEmail !== 'object')) {
      return res.status(400).json({ 
        message: 'Interviewer email is required. Please provide the interviewer email address (e.g., sarah.chen@company.com or {name: "Sarah Chen", email: "sarah.chen@company.com"}).' 
      });
    }

    // Handle optional meetingLink - use from interview if not provided (for evaluation purposes)
    const finalMeetingLink = meetingLink && typeof meetingLink === 'string' && meetingLink.trim().length > 0
      ? meetingLink.trim()
      : (interview.meetingLink || null);

    // Handle optional resumeId - use candidate's resume if not provided (for evaluation purposes)
    let resumeToAttach = null;
    let resumeText = `Resume for ${interview.candidateName}`;
    let resumeCandidateName = interview.candidateName;

    if (resumeId) {
      resumeToAttach = await Resume.findById(resumeId);
      if (resumeToAttach) {
        resumeText = resumeToAttach.resumeText || `Resume for ${resumeToAttach.candidateName}`;
        resumeCandidateName = resumeToAttach.candidateName || interview.candidateName;
      }
    } else {
      // Fallback to candidate's resume if resumeId not provided
      resumeToAttach = interview.candidateId;
      if (resumeToAttach && resumeToAttach.resumeText) {
        resumeText = resumeToAttach.resumeText;
        resumeCandidateName = resumeToAttach.candidateName || interview.candidateName;
      }
    }

    // Create resume attachment (using selected resume or candidate's resume)
    // Only attach if resumeId was provided (for evaluation purposes)
    const candidateResumeAttachment = resumeId ? {
      filename: `${resumeCandidateName}_Resume.txt`,
      url: null,
      size: resumeText.length,
      mimeType: 'text/plain',
    } : null;

    // Candidate email may or may not have resume (based on attachResume flag and resumeId provided)
    const candidateResumeAttachmentList = (attachResume && candidateResumeAttachment) ? [candidateResumeAttachment] : [];

    // Format email body for candidate with interview details and meeting link
    const candidateEmailBody = body || `Dear ${interview.candidateName},

We are pleased to invite you for an interview for the Python Developer position.

Interview Details:
- Type: ${interview.interviewType}
${finalMeetingLink ? `- Meeting Link: ${finalMeetingLink}` : '- Meeting Link: Not provided'}
${interview.location ? `- Location: ${interview.location}` : ''}

Please confirm your attendance.

Best regards,
Sarah Chen
HR Manager`;

    // Format email body for interviewer
    const interviewerName = typeof interviewerEmail === 'object' ? interviewerEmail.name : 'Sarah Chen';
    const interviewerEmailAddress = typeof interviewerEmail === 'object' ? interviewerEmail.email : interviewerEmail.trim();
    
    const interviewerEmailBody = `Dear ${interviewerName},

You have an interview scheduled with ${interview.candidateName} for the Python Developer position.

Interview Details:
- Candidate: ${interview.candidateName} (${candidateEmail.trim()})
- Type: ${interview.interviewType}
${finalMeetingLink ? `- Meeting Link: ${finalMeetingLink}` : '- Meeting Link: Not provided'}
${interview.location ? `- Location: ${interview.location}` : ''}

Please find the candidate's resume attached.

Best regards,
HR Team`;

    // Create email records for both candidate and interviewer
    const candidateEmailRecord = await Email.create({
      simulationId: session._id,
      taskId: 'hr_t3',
      userId,
      type: 'sent',
      folder: 'sent',
      from: {
        name: 'Sarah Chen',
        email: 'sarah.chen@company.com',
      },
      to: [{
        name: interview.candidateName,
        email: candidateEmail.trim(),
      }],
      subject: subject || `Interview Invitation - Python Developer Position`,
      body: candidateEmailBody,
      bodyHtml: candidateEmailBody.replace(/\n/g, '<br>'),
      attachments: candidateResumeAttachmentList,
      candidateId: interview.candidateId,
      candidateName: interview.candidateName,
      interviewScheduleId: interview._id,
      sentAt: new Date(),
    });

    // Create email for interviewer (attach resume if resumeId was provided)
    const interviewerResumeAttachment = resumeId ? {
      filename: `${resumeCandidateName}_Resume.txt`,
      url: null,
      size: resumeText.length,
      mimeType: 'text/plain',
    } : null;

    // Interviewer email should always have resume, but only if resumeId was provided (for evaluation)
    const interviewerResumeAttachmentList = interviewerResumeAttachment ? [interviewerResumeAttachment] : [];

    const interviewerEmailRecord = await Email.create({
      simulationId: session._id,
      taskId: 'hr_t3',
      userId,
      type: 'sent',
      folder: 'sent',
      from: {
        name: 'HR Team',
        email: 'hr@company.com',
      },
      to: [{
        name: interviewerName,
        email: interviewerEmailAddress,
      }],
      subject: `Interview Scheduled - ${interview.candidateName} - Python Developer Position`,
      body: interviewerEmailBody,
      bodyHtml: interviewerEmailBody.replace(/\n/g, '<br>'),
      attachments: interviewerResumeAttachmentList, // Attach resume if resumeId was provided (for evaluation)
      candidateId: interview.candidateId,
      candidateName: interview.candidateName,
      interviewScheduleId: interview._id,
      sentAt: new Date(),
    });

    // Update interview with email references and meeting link (if provided)
    interview.emailSent = true;
    interview.emailId = candidateEmailRecord._id; // Store candidate email ID
    if (finalMeetingLink) {
      interview.meetingLink = finalMeetingLink; // Update meeting link if provided
    }
    await interview.save();

    res.status(201).json({
      emails: [
        {
          id: candidateEmailRecord._id.toString(),
          type: 'candidate',
          subject: candidateEmailRecord.subject,
          body: candidateEmailRecord.body,
          to: candidateEmailRecord.to,
          sentAt: candidateEmailRecord.sentAt,
          attachments: candidateEmailRecord.attachments,
          meetingLink: finalMeetingLink,
        },
        {
          id: interviewerEmailRecord._id.toString(),
          type: 'interviewer',
          subject: interviewerEmailRecord.subject,
          body: interviewerEmailRecord.body,
          to: interviewerEmailRecord.to,
          sentAt: interviewerEmailRecord.sentAt,
          attachments: interviewerEmailRecord.attachments,
          meetingLink: finalMeetingLink,
        },
      ],
      interview: {
        id: interview._id.toString(),
        emailSent: interview.emailSent,
        meetingLink: finalMeetingLink,
      },
      message: 'Emails sent successfully to candidate and interviewer',
    });
  } catch (error) {
    console.error('Send interview email error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get inbox (sent and received emails)
 */
export const getInbox = async (req, res) => {
  try {
    const userId = req.user.id;
    const { folder = 'inbox', taskId } = req.query;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Get emails
    const query = {
      simulationId: session._id,
      userId,
    };

    if (taskId) {
      query.taskId = taskId;
    }

    if (folder === 'all') {
      // Get all emails
    } else {
      query.folder = folder;
    }

    const emails = await Email.find(query)
      .sort({ sentAt: -1, receivedAt: -1 })
      .populate('candidateId', 'candidateName email')
      .populate('interviewScheduleId');

    res.json({
      emails: emails.map(email => ({
        id: email._id.toString(),
        type: email.type,
        folder: email.folder,
        from: email.from,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        body: email.body,
        bodyHtml: email.bodyHtml,
        attachments: email.attachments,
        candidateId: email.candidateId?._id?.toString(),
        candidateName: email.candidateName,
        interviewScheduleId: email.interviewScheduleId?._id?.toString(),
        read: email.read,
        starred: email.starred,
        important: email.important,
        sentAt: email.sentAt,
        receivedAt: email.receivedAt,
        readAt: email.readAt,
        createdAt: email.createdAt,
      })),
      count: emails.length,
    });
  } catch (error) {
    console.error('Get inbox error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all interviews for hr_t3
 */
export const getInterviews = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Get all interviews for hr_t3
    const interviews = await InterviewSchedule.find({
      simulationId: session._id,
      taskId: 'hr_t3',
    })
      .populate('candidateId', 'candidateName email skills experience')
      .sort({ startTime: 1 });

    res.json({
      interviews: interviews.map(interview => ({
        id: interview._id.toString(),
        candidateId: interview.candidateId._id.toString(),
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail,
        title: interview.title,
        description: interview.description,
        startTime: interview.startTime,
        endTime: interview.endTime,
        duration: interview.duration,
        interviewType: interview.interviewType,
        location: interview.location,
        meetingLink: interview.meetingLink,
        status: interview.status,
        emailSent: interview.emailSent,
        emailId: interview.emailId?.toString(),
        createdAt: interview.createdAt,
      })),
      count: interviews.length,
    });
  } catch (error) {
    console.error('Get interviews error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Candidate confirmation response removed - no conflicts or confirmations needed

