import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';

async function generate() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([200, 200]);
  page.drawText('Test PDF File!');
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test.pdf', pdfBytes);

  const docx = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun("Test")] })] }]
  });
  const docxBytes = await Packer.toBuffer(docx);
  fs.writeFileSync('test.docx', docxBytes);

  const jpgBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  fs.writeFileSync('test.jpg', Buffer.from(jpgBase64, 'base64'));
}
generate().catch(console.error);
