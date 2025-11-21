import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure AWS S3 (optional)
let s3 = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/webm',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: PDF, DOCX, XLSX, CSV, PNG, JPG, MP3, WAV'), false);
  }
};

// Local storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * Upload file to S3 (if configured) or return local path
 */
export async function uploadFileToStorage(file, folder = 'files') {
  if (s3 && process.env.AWS_S3_BUCKET) {
    // Upload to S3
    const key = `${folder}/${Date.now()}-${file.originalname}`;
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: fs.createReadStream(file.path),
      ContentType: file.mimetype,
    };

    const result = await s3.upload(params).promise();
    // Delete local file after S3 upload
    fs.unlinkSync(file.path);
    return result.Location;
  } else {
    // Return local URL
    return `/uploads/${path.basename(file.path)}`;
  }
}

/**
 * Download file from URL (local or S3) and return file buffer
 */
async function downloadFile(fileUrl) {
  // If it's a local file path
  if (fileUrl.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '../../', fileUrl);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    throw new Error(`Local file not found: ${filePath}`);
  }

  // If it's an S3 URL or external URL
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith('https') ? https : http;
    protocol.get(fileUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract text content from file based on file type
 */
export async function extractFileContent(fileUrl) {
  try {
    const fileBuffer = await downloadFile(fileUrl);
    const ext = path.extname(fileUrl).toLowerCase();
    const fileName = path.basename(fileUrl);

    let extractedText = '';

    switch (ext) {
      case '.pdf':
        try {
          const pdfParse = (await import('pdf-parse')).default;
          const pdfData = await pdfParse(fileBuffer);
          extractedText = pdfData.text;
        } catch (error) {
          console.error(`Error parsing PDF ${fileName}:`, error);
          extractedText = `[PDF file: ${fileName} - Could not extract text content]`;
        }
        break;

      case '.docx':
        try {
          const mammoth = (await import('mammoth')).default;
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText = result.value;
        } catch (error) {
          console.error(`Error parsing DOCX ${fileName}:`, error);
          extractedText = `[DOCX file: ${fileName} - Could not extract text content]`;
        }
        break;

      case '.doc':
        // .doc files are binary and harder to parse, might need additional library
        extractedText = `[DOC file: ${fileName} - Please convert to DOCX for text extraction]`;
        break;

      case '.xlsx':
      case '.xls':
        try {
          const xlsxModule = await import('xlsx');
          const XLSX = xlsxModule.default || xlsxModule;
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          const sheetNames = workbook.SheetNames;
          const allSheetsText = [];

          for (const sheetName of sheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            allSheetsText.push(`Sheet: ${sheetName}\n${JSON.stringify(sheetData, null, 2)}`);
          }

          extractedText = allSheetsText.join('\n\n');
        } catch (error) {
          console.error(`Error parsing Excel ${fileName}:`, error);
          extractedText = `[Excel file: ${fileName} - Could not extract content]`;
        }
        break;

      case '.csv':
        try {
          const { parse } = await import('csv-parse/sync');
          const csvText = fileBuffer.toString('utf-8');
          const records = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
          });
          extractedText = JSON.stringify(records, null, 2);
        } catch (error) {
          console.error(`Error parsing CSV ${fileName}:`, error);
          extractedText = `[CSV file: ${fileName} - Could not extract content]`;
        }
        break;

      case '.png':
      case '.jpg':
      case '.jpeg':
        // For images, we can't extract text without OCR
        // You could add Tesseract.js for OCR if needed
        extractedText = `[Image file: ${fileName} - Image content cannot be extracted as text. Please describe the image in your submission text.]`;
        break;

      case '.txt':
        extractedText = fileBuffer.toString('utf-8');
        break;

      default:
        extractedText = `[File: ${fileName} - Unsupported file type for text extraction]`;
    }

    return {
      fileName,
      fileType: ext,
      content: extractedText,
      success: extractedText && !extractedText.includes('Could not extract') && !extractedText.includes('Unsupported'),
    };
  } catch (error) {
    console.error(`Error extracting content from ${fileUrl}:`, error);
    return {
      fileName: path.basename(fileUrl),
      fileType: path.extname(fileUrl),
      content: `[Error extracting content: ${error.message}]`,
      success: false,
    };
  }
}

/**
 * Extract content from multiple files
 */
export async function extractMultipleFileContents(fileUrls) {
  const results = [];
  
  for (const fileUrl of fileUrls) {
    try {
      const extracted = await extractFileContent(fileUrl);
      results.push(extracted);
    } catch (error) {
      console.error(`Failed to extract content from ${fileUrl}:`, error);
      results.push({
        fileName: path.basename(fileUrl),
        fileType: path.extname(fileUrl),
        content: `[Error: ${error.message}]`,
        success: false,
      });
    }
  }
  
  return results;
}

