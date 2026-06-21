// app/api/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import fs from 'fs/promises';
import path from 'path';

// Force Node.js runtime to allow File System (fs) access
export const dynamic = 'force-dynamic';

// This map strictly binds specific files to specific timeline stages
const STAGE_MAP: Record<string, { id: string, filename: string, title: string }[]> = {
  PROPOSAL: [
    { id: 'prop', filename: 'proposal.tex', title: 'FYP Proposal Template' }
  ],
  THESIS_DRAFT: [
    { id: 'main', filename: 'main.tex', title: 'Main Configuration (main.tex)' },
    { id: 'ch1', filename: 'ch1_introduction.tex', title: 'Chapter 1: Introduction' },
    { id: 'ch2', filename: 'ch2_background.tex', title: 'Chapter 2: Background' },
    { id: 'ch3', filename: 'ch3_srs.tex', title: 'Chapter 3: SRS' },
    { id: 'ch4', filename: 'ch4_system_modeling.tex', title: 'Chapter 4: System Modeling' },
    { id: 'ch5', filename: 'ch5_testing.tex', title: 'Chapter 5: System Testing' },
    { id: 'ch6', filename: 'ch6_conclusion.tex', title: 'Chapter 6: Conclusion' },
    { id: 'ref', filename: 'references.tex', title: 'References' },
    { id: 'app', filename: 'appendix.tex', title: 'Appendix' }
  ],
  FINAL_DELIVERABLES: [
    { id: 'tpage', filename: '00_titlepage.tex', title: 'Title Page' },
    { id: 'abs', filename: '01_abstract.tex', title: 'Abstract' },
    { id: 'cert', filename: '02_certificate.tex', title: 'Certificate' },
    { id: 'dec', filename: '03_declaration.tex', title: 'Declaration' },
    { id: 'plag', filename: '04_plagiarism.tex', title: 'Plagiarism Form' }
  ]
};

export async function GET(req: NextRequest) {
  try {
    // 1. Security Check
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Determine Timeline Stage
    const url = new URL(req.url);
    const stage = url.searchParams.get('stage') || 'PROPOSAL';

    const requiredFiles = STAGE_MAP[stage];
    if (!requiredFiles) {
      return NextResponse.json({ error: 'Invalid Stage' }, { status: 400 });
    }

    // 3. Resolve absolute path to our new latex_templates folder
    const templatesDir = path.join(process.cwd(), 'latex_templates');

    // 4. Fetch all required files concurrently for maximum speed
    const templates = await Promise.all(requiredFiles.map(async (file) => {
      try {
        const filePath = path.join(templatesDir, file.filename);
        const content = await fs.readFile(filePath, 'utf-8');
        return { 
          id: file.id,
          title: file.title, 
          filename: file.filename, 
          content 
        };
      } catch (err) {
         console.warn(`⚠️ Template file missing: ${file.filename}`);
         return { 
           id: file.id,
           title: file.title, 
           filename: file.filename, 
           content: `% ERROR: Could not load ${file.filename} from the server. Please ensure the file exists in the latex_templates directory.` 
         };
      }
    }));

    return NextResponse.json({ templates }, { status: 200 });

  } catch (error: any) {
    console.error('Template Fetch Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}