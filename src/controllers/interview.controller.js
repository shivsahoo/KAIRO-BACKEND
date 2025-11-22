import SimulationSession from '../models/SimulationSession.model.js';
import InterviewSchedule from '../models/InterviewSchedule.model.js';
import Email from '../models/Email.model.js';
import Resume from '../models/Resume.model.js';
import InterviewTranscript from '../models/InterviewTranscript.model.js';
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

    // Note: Removed task validation - candidates can be viewed at any time
    // This allows flexibility for users to access candidate information for any task

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
    let {
      candidateId, // Candidate ID from resume
      candidateEmail, // Candidate email address (can use instead of candidateId)
      interviewerEmail, // Interviewer email address
      interviewerName, // Interviewer name
      resumeId, // Optional: Resume to attach in emails (from shared resumes list)
      startTime,
      endTime,
      title,
      description,
      interviewType,
      location,
      meetingLink, // Optional: Will be auto-generated if not provided
    } = req.body;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Note: Removed task validation - interviews can be scheduled at any time
    // This allows flexibility for users to schedule interviews for any task

    // Validate candidate - can use either candidateId or candidateEmail
    let candidate = null;
    let candidateName = '';
    let finalCandidateEmail = '';
    let finalCandidateId = null;
    
    if (candidateId) {
      candidate = await Resume.findById(candidateId);
      if (!candidate) {
        return res.status(404).json({ message: 'Candidate not found' });
      }
      finalCandidateId = candidate._id;
      candidateName = candidate.candidateName;
      finalCandidateEmail = candidateEmail || candidate.email;
    } else if (candidateEmail) {
      finalCandidateEmail = candidateEmail;
      // Try to find candidate by email
      candidate = await Resume.findOne({ email: candidateEmail });
      if (candidate) {
        finalCandidateId = candidate._id;
        candidateName = candidate.candidateName;
      } else {
        candidateName = candidateEmail.split('@')[0]; // Use email username as fallback
      }
    } else {
      return res.status(400).json({ message: 'Either candidateId or candidateEmail is required' });
    }

    if (!finalCandidateEmail || typeof finalCandidateEmail !== 'string' || finalCandidateEmail.trim().length === 0) {
      return res.status(400).json({ message: 'Candidate email is required' });
    }

    if (!interviewerEmail || typeof interviewerEmail !== 'string' || interviewerEmail.trim().length === 0) {
      return res.status(400).json({ message: 'Interviewer email is required' });
    }

    // Validate meeting link is provided (REQUIRED for evaluation)
          // Generate meeting link automatically if not provided
          if (!meetingLink || typeof meetingLink !== 'string' || meetingLink.trim().length === 0) {
            meetingLink = `https://meet.company.com/interview/${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            console.log(`🔗 Generated meeting link: ${meetingLink}`);
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

    // Use provided resume or default to candidate's resume
    if (!resumeId && candidate) {
      resumeToAttach = candidate;
    } else if (resumeId) {
      resumeToAttach = await Resume.findById(resumeId);
      if (!resumeToAttach) {
        return res.status(404).json({ message: 'Selected resume not found' });
      }
    }

    // Use provided resume or default to candidate's resume
    if (!resumeId && candidate) {
      resumeToAttach = candidate;
    } else if (resumeId) {
      resumeToAttach = await Resume.findById(resumeId);
      if (!resumeToAttach) {
        return res.status(404).json({ message: 'Selected resume not found' });
      }
    }

    // Create interview schedule
    const interview = await InterviewSchedule.create({
      simulationId: session._id,
      taskId: 'hr_t3',
      userId,
      candidateId: finalCandidateId,
      resumeId: resumeToAttach ? resumeToAttach._id : null, // Store resume to attach in emails
      candidateName: candidateName,
      candidateEmail: finalCandidateEmail.trim(),
      interviewerName: interviewerName || 'Sarah Chen (HR Manager)',
      interviewType: interviewType || 'video',
      title: title || 'Interview - Python Developer Position',
      description: description || `Interview with ${candidateName} for Python Developer position`,
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
      interviewId, // Optional: Link to a scheduled interview
      to, // REQUIRED: Candidate email address
      cc, // REQUIRED: Interviewer email address (will be CC'd)
      subject, // REQUIRED: Email subject
      body, // REQUIRED: Email body
      resumeId, // Optional: Resume to attach
      meetingLink, // Optional: Meeting link for tracking
      attachResume, // Optional: whether to attach resume (defaults to true if resumeId provided)
    } = req.body;

    // Validate required fields
    if (!to || typeof to !== 'string' || to.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Candidate email (to) is required' 
      });
    }

    if (!cc || typeof cc !== 'string' || cc.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Interviewer email (cc) is required' 
      });
    }

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Email subject is required' 
      });
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Email body is required' 
      });
    }

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Note: Removed task validation - emails can be sent at any time during the simulation
    // This allows flexibility for users to send emails for any task, not just hr_t3

    // Get interview schedule if provided (optional)
    let interview = null;
    if (interviewId) {
      interview = await InterviewSchedule.findById(interviewId)
        .populate('candidateId')
        .populate('resumeId');
      
      if (!interview) {
        return res.status(404).json({ message: 'Interview schedule not found' });
      }

      if (interview.simulationId.toString() !== session._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized access to interview' });
      }
    }

    // Get candidate name from email or interview
    let candidateName = to.split('@')[0]; // Default: extract from email
    if (interview && interview.candidateName) {
      candidateName = interview.candidateName;
    }

    // Handle resume attachment if resumeId provided
    let resumeToAttach = null;
    let resumeText = `Resume for ${candidateName}`;
    let resumeCandidateName = candidateName;

    if (resumeId) {
      resumeToAttach = await Resume.findById(resumeId);
      if (resumeToAttach) {
        resumeText = resumeToAttach.resumeText || `Resume for ${resumeToAttach.candidateName}`;
        resumeCandidateName = resumeToAttach.candidateName || candidateName;
        // Update candidate name if found in resume
        candidateName = resumeToAttach.candidateName || candidateName;
      }
    }

    // Create resume attachment if resumeId provided
    const resumeAttachment = resumeId && resumeToAttach ? {
      filename: `${resumeCandidateName}_Resume.txt`,
      url: null,
      size: resumeText.length,
      mimeType: 'text/plain',
    } : null;

    // Attach resume if resumeId provided and attachResume is not explicitly false
    const shouldAttachResume = resumeId && (attachResume !== false);
    const attachmentsList = shouldAttachResume && resumeAttachment ? [resumeAttachment] : [];

    // Create email record - to candidate, CC interviewer
    const emailRecord = await Email.create({
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
        name: candidateName,
        email: to.trim(),
      }],
      cc: [{
        name: 'Sarah Chen',
        email: cc.trim(),
      }],
      subject: subject,
      body: body,
      bodyHtml: body.replace(/\n/g, '<br>'),
      attachments: attachmentsList,
      candidateId: interview?.candidateId?._id || resumeToAttach?._id || null,
      candidateName: candidateName,
      interviewScheduleId: interview?._id || null,
      sentAt: new Date(),
    });

    // Update interview if it exists
    if (interview) {
      interview.emailSent = true;
      interview.emailId = emailRecord._id;
      if (meetingLink) {
        interview.meetingLink = meetingLink;
      }
      await interview.save();
    }

    res.status(201).json({
      email: {
        id: emailRecord._id.toString(),
        subject: emailRecord.subject,
        body: emailRecord.body,
        to: emailRecord.to,
        cc: emailRecord.cc,
        sentAt: emailRecord.sentAt,
        attachments: emailRecord.attachments,
        meetingLink: meetingLink || null,
      },
      interview: interview ? {
        id: interview._id.toString(),
        emailSent: interview.emailSent,
        meetingLink: interview.meetingLink,
      } : null,
      message: 'Email sent successfully to candidate with interviewer in CC',
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

/**
 * Save interview transcript
 */
export const saveTranscript = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      sessionId,
      roomName,
      agentName,
      startTime,
      endTime,
      duration,
      transcript,
    } = req.body;

    if (!sessionId || !transcript || !Array.isArray(transcript)) {
      return res.status(400).json({ 
        message: 'sessionId and transcript array are required' 
      });
    }

    // Create transcript record
    const transcriptRecord = await InterviewTranscript.create({
      userId,
      sessionId,
      roomName: roomName || sessionId,
      agentName: agentName || 'Drew_2a0',
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration: duration || (endTime - startTime),
      transcript: transcript,
    });

    res.status(201).json({
      transcript: {
        id: transcriptRecord._id.toString(),
        sessionId: transcriptRecord.sessionId,
        startTime: transcriptRecord.startTime,
        endTime: transcriptRecord.endTime,
        duration: transcriptRecord.duration,
        messageCount: transcriptRecord.transcript.length,
        evaluated: transcriptRecord.evaluated,
      },
      message: 'Transcript saved successfully',
    });
  } catch (error) {
    console.error('Save transcript error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get interview transcripts
 */
export const getTranscripts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.query;

    const query = { userId };
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const transcripts = await InterviewTranscript.find(query)
      .sort({ createdAt: -1 })
      .select('-transcript'); // Exclude full transcript for list view

    res.json({
      transcripts: transcripts.map(t => ({
        id: t._id.toString(),
        sessionId: t.sessionId,
        roomName: t.roomName,
        agentName: t.agentName,
        startTime: t.startTime,
        endTime: t.endTime,
        duration: t.duration,
        messageCount: t.transcript.length,
        evaluated: t.evaluated,
        createdAt: t.createdAt,
      })),
      count: transcripts.length,
    });
  } catch (error) {
    console.error('Get transcripts error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get single transcript by ID
 */
export const getTranscript = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const transcript = await InterviewTranscript.findOne({
      _id: id,
      userId,
    });

    if (!transcript) {
      return res.status(404).json({ message: 'Transcript not found' });
    }

    res.json({
      transcript: {
        id: transcript._id.toString(),
        sessionId: transcript.sessionId,
        roomName: transcript.roomName,
        agentName: transcript.agentName,
        startTime: transcript.startTime,
        endTime: transcript.endTime,
        duration: transcript.duration,
        transcript: transcript.transcript,
        evaluated: transcript.evaluated,
        evaluation: transcript.evaluation,
        createdAt: transcript.createdAt,
      },
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Candidate confirmation response removed - no conflicts or confirmations needed

