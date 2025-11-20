import { upload, uploadFileToStorage } from '../utils/file.upload.js';

/**
 * Upload file
 */
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to storage (S3 or local)
    const url = await uploadFileToStorage(req.file, 'files');

    res.json({
      url,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Upload audio file
 */
export const uploadAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file uploaded' });
    }

    // Upload to storage (S3 or local)
    const url = await uploadFileToStorage(req.file, 'audio');

    res.json({
      url,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('Upload audio error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export { upload };

