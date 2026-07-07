import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);

    const hasPaginationParams = searchParams.has('page') || searchParams.has('limit');
    const hasFilterParams =
      searchParams.has('program') ||
      searchParams.has('batch') ||
      searchParams.has('status') ||
      searchParams.has('search');

    const shouldPaginate = hasPaginationParams || hasFilterParams;

    const page = parsePositiveInteger(searchParams.get('page'), DEFAULT_PAGE);
    const requestedLimit = parsePositiveInteger(searchParams.get('limit'), DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    const program = searchParams.get('program')?.trim();
    const batch = searchParams.get('batch')?.trim();
    const status = searchParams.get('status')?.trim();
    const search = searchParams.get('search')?.trim();

    const query: any = { role: 'student' };

    if (program && program !== 'All') {
      query.program = program;
    }

    if (batch && batch !== 'All') {
      query.batch = batch;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      const searchRegex = new RegExp(safeSearch, 'i');

      query.$or = [
        { name: searchRegex },
        { rollNo: searchRegex },
        { email: searchRegex },
      ];
    }

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

    if (!shouldPaginate) {
      const [students, batches] = await Promise.all([
        User.find(query)
          .select(selectedFields)
          .sort({ createdAt: -1 })
          .lean(),
        filterMetaPromise,
      ]);

      console.log(`Admin students query completed in ${Date.now() - startedAt}ms`);

      return NextResponse.json(
        {
          students,
          pagination: {
            page: 1,
            limit: students.length,
            total: students.length,
            totalPages: students.length > 0 ? 1 : 0,
          },
          filterMeta: {
            batches: batches.sort(),
          },
        },
        { status: 200 }
      );
    }

    const skip = (page - 1) * limit;

    const [students, total, batches] = await Promise.all([
      User.find(query)
        .select(selectedFields)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
      filterMetaPromise,
    ]);

    const totalPages = Math.ceil(total / limit);

    console.log(`Admin students query completed in ${Date.now() - startedAt}ms`);

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
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Admin Students Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}