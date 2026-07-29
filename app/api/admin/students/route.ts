import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import { normalizeRollNo } from '../../../../lib/rollNo';
import User from '../../../../models/User';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { isValidEmailAddress, normalizeEmailAddress } from '../../../../lib/studentIdentity';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 100;

type StudentCursor = {
  createdAt: string;
  id: string;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

function parseCursor(value: string | null): StudentCursor | null {
  if (!value) return null;

  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as StudentCursor;
    if (
      !cursor
      || typeof cursor.createdAt !== 'string'
      || Number.isNaN(new Date(cursor.createdAt).getTime())
      || !mongoose.Types.ObjectId.isValid(cursor.id)
    ) {
      return null;
    }
    return cursor;
  } catch {
    return null;
  }
}

function createCursor(student: { createdAt?: Date; _id?: unknown }) {
  if (!student.createdAt || !student._id) return null;

  return Buffer.from(JSON.stringify({
    createdAt: student.createdAt.toISOString(),
    id: String(student._id),
  })).toString('base64url');
}

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);

    const page = parsePositiveInteger(searchParams.get('page'), DEFAULT_PAGE);
    const requestedLimit = parsePositiveInteger(searchParams.get('limit'), DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    const program = searchParams.get('program')?.trim();
    const batch = searchParams.get('batch')?.trim();
    const status = searchParams.get('status')?.trim();
    const search = searchParams.get('search')?.trim().slice(0, MAX_SEARCH_LENGTH);

    const filters: Record<string, unknown>[] = [{ role: 'student' }];

    if (program && program !== 'All') {
      filters.push({ program });
    }

    if (batch && batch !== 'All') {
      filters.push({ batch });
    }

    if (status && status !== 'All') {
      filters.push({ status });
    }

    if (search) {
      const clauses: Record<string, unknown>[] = [
        { rollNo: normalizeRollNo(search) },
        { name: new RegExp(`^${escapeRegex(search)}`, 'i') },
      ];
      if (isValidEmailAddress(search)) {
        clauses.splice(1, 0, { email: normalizeEmailAddress(search) });
      }
      filters.push({ $or: clauses });
    }

    const baseQuery = filters.length === 1 ? filters[0] : { $and: [...filters] };
    const cursor = parseCursor(searchParams.get('cursor'));
    if (page > DEFAULT_PAGE && !cursor) {
      return NextResponse.json({ error: 'A pagination cursor is required for later pages.' }, { status: 400 });
    }
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      filters.push({
        $or: [
          { createdAt: { $lt: createdAt } },
          { createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } },
        ],
      });
    }

    const query = filters.length === 1 ? filters[0] : { $and: [...filters] };

    const selectedFields = [
      '_id',
      'name',
      'rollNo',
      'email',
      'program',
      'batch',
      'semester',
      'status',
      'isActive',
      'monthlyLoginCount',
      'createdAt',
    ].join(' ');

    const filterMetaPromise = User.distinct('batch', {
      role: 'student',
      batch: { $nin: [null, ''] },
    });

    const [students, total, batches] = await Promise.all([
      User.find(query)
        .select(selectedFields)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      User.countDocuments(baseQuery),
      filterMetaPromise,
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        students,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        filterMeta: {
          batches: batches.sort(),
        },
        nextCursor: students.length === limit ? createCursor(students.at(-1)) : null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Admin Students Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}
