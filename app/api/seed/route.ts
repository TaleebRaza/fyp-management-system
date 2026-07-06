// app/api/seed/route.ts
import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import bcrypt from 'bcryptjs';

const seededData = [
  { name: "Danial", rollNo: "DA-01", email: "danial@uoh.edu.pk", password: "732918" },
  { name: "Fawad Ali shah", rollNo: "FA-01", email: "fawad@uoh.edu.pk", password: "482019" },
  { name: "Jameel Ahmed", rollNo: "JA-01", email: "jameel@uoh.edu.pk", password: "193847" },
  { name: "Fahad qureshi", rollNo: "FQ-01", email: "fahad@uoh.edu.pk", password: "582910" },
  { name: "Amjad Khan", rollNo: "AK-01", email: "amjad@uoh.edu.pk", password: "849201" },
  { name: "Abdul Rehman", rollNo: "AR-01", email: "abdul@uoh.edu.pk", password: "294810" },
  { name: "Gul Nawaz", rollNo: "GN-01", email: "gul@uoh.edu.pk", password: "582918" },
  { name: "Raja mujeeb", rollNo: "RM-01", email: "raja@uoh.edu.pk", password: "103948" },
  { name: "Naveed", rollNo: "NA-01", email: "naveed@uoh.edu.pk", password: "849202" },
  { name: "Ihtisham", rollNo: "IH-01", email: "ihtisham@uoh.edu.pk", password: "582911" },
  { name: "Waris", rollNo: "WA-01", email: "waris@uoh.edu.pk", password: "294811" },
  { name: "Wafa Bibi", rollNo: "WB-01", email: "wafavisiting@uoh.edu.pk", password: "582919" },
  { name: "Khola Nazar", rollNo: "KN-01", email: "khola@uoh.edu.pk", password: "193848" },
  { name: "Ayesha Alam", rollNo: "AA-01", email: "ayeshaa@uoh.edu.pk", password: "849203" },
  { name: "Maria Bibi", rollNo: "MB-01", email: "maria@uoh.edu.pk", password: "582912" },
  { name: "Ayesha Bibi", rollNo: "AB-01", email: "ayeshab@uoh.edu.pk", password: "294812" },
  { name: "Aneeqa Bano", rollNo: "AB-02", email: "aneeqa@uoh.edu.pk", password: "582920" },
  { name: "Sidra Bibi", rollNo: "SB-01", email: "sidra@uoh.edu.pk", password: "103949" },
  { name: "Zainab Bibi", rollNo: "ZB-01", email: "zainab@uoh.edu.pk", password: "849204" },
  { name: "Fiza", rollNo: "FI-01", email: "fiza1@uoh.edu.pk", password: "582913" },
  { name: "Muqqadas", rollNo: "MU-01", email: "muqqadas@uoh.edu.pk", password: "294813" },
  { name: "Irsa", rollNo: "IR-01", email: "irsa@uoh.edu.pk", password: "582921" },
  { name: "Sana", rollNo: "SA-01", email: "sana@uoh.edu.pk", password: "193849" },
  { name: "Zanib", rollNo: "ZA-01", email: "zanib@uoh.edu.pk", password: "849205" },
  { name: "fiza", rollNo: "FI-02", email: "fiza2@uoh.edu.pk", password: "582914" },
  { name: "Sawera", rollNo: "SA-02", email: "sawera@uoh.edu.pk", password: "294814" },
  { name: "Yursa", rollNo: "YU-01", email: "yursa@uoh.edu.pk", password: "582922" },
  { name: "Amin", rollNo: "AM-01", email: "amin@uoh.edu.pk", password: "103950" },
  { name: "Farah Shaheen", rollNo: "FS-01", email: "farah@uoh.edu.pk", password: "849206" },
  { name: "Ramla Shiekh", rollNo: "RS-01", email: "ramla@uoh.edu.pk", password: "582915" },
  { name: "Saman shaheen", rollNo: "SS-01", email: "saman@uoh.edu.pk", password: "294815" }
];

export async function GET() {
  try {
    await connectToDatabase();
    
    let count = 0;
    
    for (const sup of seededData) {
      // Check if they already exist so we don't accidentally duplicate
      const existing = await User.findOne({ rollNo: sup.rollNo });
      
      if (!existing) {
        const hashedPassword = await bcrypt.hash(sup.password, 10);
        const migrationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await User.create({
          name: sup.name,
          email: sup.email,
          rollNo: sup.rollNo,
          password: hashedPassword,
          role: 'supervisor',
          migrationCode: migrationCode,
          notificationsEnabled: false // Explicitly disabled per your request
        });
        count++;
      }
    }

    return NextResponse.json({ message: `Successfully seeded ${count} new supervisors.` }, { status: 200 });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}