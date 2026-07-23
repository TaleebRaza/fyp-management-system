// app/api/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireCurrentUser } from '../../../lib/security/auth';
import User from '../../../models/User';
import Project from '../../../models/Project';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TEMPLATE_STAGES = [
  'PROPOSAL',
  'THESIS_DRAFT',
  'FINAL_DELIVERABLES',
] as const;

type TemplateStage = (typeof TEMPLATE_STAGES)[number];

type TemplateDefinition = {
  id: string;
  title: string;
  wordFilename: string;
};

// The existing phase-to-template assignments are intentionally unchanged.
const STAGE_MAP: Record<TemplateStage, readonly TemplateDefinition[]> = {
  PROPOSAL: [
    {
      id: 'prop',
      title: 'FYP Proposal Template',
      wordFilename: 'proposal.html',
    },
  ],
  THESIS_DRAFT: [
    {
      id: 'main',
      title: 'Thesis Master Setup Guide',
      wordFilename: 'main.html',
    },
    {
      id: 'ch1',
      title: 'Chapter 1: Introduction',
      wordFilename: 'ch1_introduction.html',
    },
    {
      id: 'ch2',
      title: 'Chapter 2: Background',
      wordFilename: 'ch2_background.html',
    },
    {
      id: 'ch3',
      title: 'Chapter 3: SRS',
      wordFilename: 'ch3_srs.html',
    },
    {
      id: 'ch4',
      title: 'Chapter 4: System Modeling',
      wordFilename: 'ch4_system_modeling.html',
    },
    {
      id: 'ch5',
      title: 'Chapter 5: System Testing',
      wordFilename: 'ch5_testing.html',
    },
    {
      id: 'ch6',
      title: 'Chapter 6: Conclusion',
      wordFilename: 'ch6_conclusion.html',
    },
    {
      id: 'ref',
      title: 'References',
      wordFilename: 'references.html',
    },
    {
      id: 'app',
      title: 'Appendix',
      wordFilename: 'appendix.html',
    },
  ],
  FINAL_DELIVERABLES: [
    {
      id: 'tpage',
      title: 'Title Page',
      wordFilename: '00_titlepage.html',
    },
    {
      id: 'abs',
      title: 'Abstract',
      wordFilename: '01_abstract.html',
    },
    {
      id: 'cert',
      title: 'Certificate',
      wordFilename: '02_certificate.html',
    },
    {
      id: 'dec',
      title: 'Declaration',
      wordFilename: '03_declaration.html',
    },
    {
      id: 'plag',
      title: 'Plagiarism Form',
      wordFilename: '04_plagiarism.html',
    },
  ],
};

function isTemplateStage(value: string): value is TemplateStage {
  return TEMPLATE_STAGES.includes(value as TemplateStage);
}

function resolveWordTemplatePath(filename: string) {
  const templatesRoot = path.resolve(process.cwd(), 'word_templates');
  const filePath = path.resolve(templatesRoot, filename);

  // ponytail: the fixed allowlist is primary protection; this is defense in depth.
  if (!filePath.startsWith(`${templatesRoot}${path.sep}`)) {
    throw new Error('Template path escaped word_templates.');
  }

  return filePath;
}

async function readWordTemplate(template: TemplateDefinition) {
  const filePath = resolveWordTemplatePath(template.wordFilename);
  const content = await fs.readFile(filePath, 'utf-8');

  return {
    id: template.id,
    title: template.title,
    filename: template.wordFilename,
    format: 'word' as const,
    content,
  };
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const stageParam = req.nextUrl.searchParams.get('stage') || 'PROPOSAL';

    if (!isTemplateStage(stageParam)) {
      return NextResponse.json(
        { error: 'Invalid stage.', code: 'INVALID_STAGE' },
        { status: 400 }
      );
    }

    if (currentUser.role === 'student') {
      const student = await User.findById(currentUser.id).select('projectId').lean();
      const project = student?.projectId ? await Project.findById(student.projectId).select('stage').lean() : null;
      if (!project || project.stage !== stageParam) {
        return NextResponse.json({ error: 'Template is not available for your current project stage.' }, { status: 403 });
      }
    }

    // LaTeX and individual-format requests are deliberately unsupported.
    if (
      req.nextUrl.searchParams.has('format') ||
      req.nextUrl.searchParams.has('template')
    ) {
      return NextResponse.json(
        {
          error: 'Only stage-based Word template requests are supported.',
          code: 'WORD_ONLY_TEMPLATES',
        },
        { status: 400 }
      );
    }

    try {
      const templates = await Promise.all(
        STAGE_MAP[stageParam].map(readWordTemplate)
      );

      return NextResponse.json(
        {
          stage: stageParam,
          defaultFormat: 'word',
          templates,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error('Word template bundle read failed:', {
        stage: stageParam,
        error,
      });

      return NextResponse.json(
        {
          error: 'One or more Word templates are unavailable.',
          code: 'WORD_TEMPLATE_BUNDLE_UNAVAILABLE',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Template Fetch Error:', error);

    return NextResponse.json(
      { error: 'Internal Server Error', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
