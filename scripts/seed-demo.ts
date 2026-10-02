/**
 * Seed script for the demo: professors and students across three colleges,
 * example communities, topics, anonymous opinions and professor replies.
 *
 * The VIT communities accept a verified `@vit.edu.in` school email, so the
 * school-email gate can be demoed with a real VIT address. NITK/IITB communities
 * use different domains so you can also show a student being turned away from
 * another college's community.
 *
 * Run with:
 *   npm run seed
 *
 * All demo accounts share the same password (SEED_DEMO_PASSWORD or "DemoPass123#").
 * The script is idempotent: it wipes previous demo data (the demo email domains
 * below) and community slugs starting with demo- before re-seeding.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import UserModel from "../src/model/User";
import CommunityModel from "../src/model/Community";
import TopicModel from "../src/model/Topic";
import ResponseModel from "../src/model/Response";
import JoinRequestModel from "../src/model/JoinRequest";
import ReportModel from "../src/model/Report";
import BanAppealModel from "../src/model/BanAppeal";
import ModerationLogModel from "../src/model/ModerationLog";
import { generateNickname } from "../src/lib/nicknames";

try {
  process.loadEnvFile();
} catch {
  // .env is optional — MONGODB_URI may be provided via the environment.
}

const MONGODB_URI = process.env.MONGODB_URI;
const SEED_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "DemoPass123#";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Add it to .env or the environment.");
  process.exit(1);
}

// Fictional school domains so the school-email gate works without a real
// institution. VIT is the "home" college for the live demo.
const VIT_DOMAIN = "vit.edu.in";
const NITK_DOMAIN = "nitk.edu.in";
const IITB_DOMAIN = "iitb.ac.in";
const DEMO_EMAIL_RE = new RegExp(
  // `hearback.edu.in` is kept so re-seeding cleans up the earlier demo data too.
  `@(hearback\\.(demo|edu\\.in)|${VIT_DOMAIN.replace(/\./g, "\\.")}|${NITK_DOMAIN.replace(/\./g, "\\.")}|${IITB_DOMAIN.replace(/\./g, "\\.")})$`,
);

type Role = "admin" | "member";

async function main() {
  await mongoose.connect(MONGODB_URI!, {});
  console.log("Connected to MongoDB");

  const hash = await bcrypt.hash(SEED_PASSWORD, 10);

  const existingDemoCommunities = await CommunityModel.find({ slug: /^demo-/ });
  const demoCommunityIds = existingDemoCommunities.map((c) => c._id);
  await ResponseModel.deleteMany({ communityId: { $in: demoCommunityIds } });
  await TopicModel.deleteMany({ communityId: { $in: demoCommunityIds } });
  await JoinRequestModel.deleteMany({ communityId: { $in: demoCommunityIds } });
  await ReportModel.deleteMany({ communityId: { $in: demoCommunityIds } });
  await BanAppealModel.deleteMany({ communityId: { $in: demoCommunityIds } });
  await ModerationLogModel.deleteMany({
    communityId: { $in: demoCommunityIds },
  });
  await CommunityModel.deleteMany({ _id: { $in: demoCommunityIds } });
  await UserModel.deleteMany({ email: DEMO_EMAIL_RE });
  console.log("Cleaned previous demo data");

  const makeUser = async (
    username: string,
    email: string,
    schoolEmail?: string,
  ) =>
    UserModel.create({
      username,
      email,
      password: hash,
      verifyCode: "00000",
      verifyCodeExpiry: new Date(Date.now() + 3600000),
      isVerified: true,
      isAcceptingMessage: true,
      messages: [],
      schoolEmail,
      // Derive the domain from the address itself — different students belong
      // to different colleges.
      schoolDomain: schoolEmail ? schoolEmail.split("@")[1] : undefined,
      schoolEmailVerifiedAt: schoolEmail ? new Date() : undefined,
    });

  const PROFESSORS = [
    { username: "prof_rajesh", email: "rajesh.kulkarni@hearback.demo" },
    { username: "prof_anita", email: "anita.iyer@hearback.demo" },
    { username: "prof_divya", email: "divya.nimbalkar@hearback.demo" },
    { username: "prof_meera", email: "meera.nair@hearback.demo" },
    { username: "prof_arjun", email: "arjun.rao@hearback.demo" },
  ];

  const makeStudent = (name: string, domain: string) => ({
    username: `stud_${name}`,
    email: `${name}.student@${domain}`,
    schoolEmail: `${name}.student@${domain}`,
  });

  const VIT_STUDENT_NAMES = [
    "aarav",
    "isha",
    "rohan",
    "sneha",
    "ved",
    "ananya",
    "karan",
    "priya",
    "aman",
    "zara",
    "dev",
    "nitika",
  ];
  const VIT_STUDENTS = VIT_STUDENT_NAMES.map((n) => makeStudent(n, VIT_DOMAIN));
  const NITK_STUDENTS = ["nithin", "varsha", "kabir"].map((n) =>
    makeStudent(n, NITK_DOMAIN),
  );
  const IITB_STUDENTS = ["aditya", "meghna", "farhan"].map((n) =>
    makeStudent(n, IITB_DOMAIN),
  );

  const professors = await Promise.all(
    PROFESSORS.map((p) => makeUser(p.username, p.email)),
  );
  const students = await Promise.all(
    VIT_STUDENTS.map((s) => makeUser(s.username, s.email, s.schoolEmail)),
  );
  const nitkStudents = await Promise.all(
    NITK_STUDENTS.map((s) => makeUser(s.username, s.email, s.schoolEmail)),
  );
  const iitbStudents = await Promise.all(
    IITB_STUDENTS.map((s) => makeUser(s.username, s.email, s.schoolEmail)),
  );
  console.log(
    `Created ${professors.length} professors and ${
      students.length + nitkStudents.length + iitbStudents.length
    } students`,
  );

  const [profDbms, profPlacement, profSe, profNitk, profIitb] = professors;

  const membersFor = (ids: (typeof students)[number][]) => {
    const used = new Set<string>();
    return ids.map((s) => {
      let nickname = generateNickname();
      while (used.has(nickname)) nickname = generateNickname();
      used.add(nickname);
      return { userId: s._id, nickname, joinedAt: new Date() };
    });
  };

  interface CommunitySeed {
    slug: string;
    name: string;
    description: string;
    avatarColor: string;
    inviteCode: string;
    admin: (typeof professors)[number];
    members: (typeof students)[number][];
    type: "normal" | "educational";
    requiredEmailDomains: string[];
    joinPolicy: "open" | "approval";
    aiModeration: boolean;
  }

  const communitySeeds: CommunitySeed[] = [
    {
      slug: "demo-vit-dbms-doubt-corner",
      name: "VIT DBMS Doubt Corner",
      description:
        "VIT-only. Ask anything about Database Management Systems — queries, indexes, transactions, normalization. No question is a silly question here.",
      avatarColor: "#6366f1",
      inviteCode: "VITDBMS",
      admin: profDbms,
      members: students,
      type: "educational",
      requiredEmailDomains: [VIT_DOMAIN],
      joinPolicy: "open",
      aiModeration: true,
    },
    {
      slug: "demo-vit-placements",
      name: "VIT Placements Discussion",
      description:
        "VIT-only. Campus placement talk: interview preparation, resume help and honest experiences shared anonymously.",
      avatarColor: "#10b981",
      inviteCode: "VITJOBS",
      admin: profPlacement,
      members: students.slice(0, 9),
      type: "educational",
      requiredEmailDomains: [VIT_DOMAIN],
      joinPolicy: "open",
      aiModeration: true,
    },
    {
      slug: "demo-vit-software-engineering",
      name: "VIT Software Engineering Q&A",
      description:
        "VIT-only. Software engineering concepts, agile and project queries — discuss freely without fear of judgment.",
      avatarColor: "#f59e0b",
      inviteCode: "VITSE26",
      admin: profSe,
      members: students.slice(8),
      type: "educational",
      requiredEmailDomains: [VIT_DOMAIN],
      joinPolicy: "approval",
      aiModeration: true,
    },
    {
      slug: "demo-nitk-dbms-doubt-corner",
      name: "NITK DBMS Doubt Corner",
      description:
        "A different college's community (NITK). Kept here so you can see that another institution's community is visible but not open to a VIT student.",
      avatarColor: "#0ea5e9",
      inviteCode: "NITKDBMS",
      admin: profNitk,
      members: nitkStudents,
      type: "educational",
      requiredEmailDomains: [NITK_DOMAIN],
      joinPolicy: "open",
      aiModeration: true,
    },
    {
      slug: "demo-iitb-software-engineering",
      name: "IITB Software Engineering Q&A",
      description:
        "Another college's community (IITB). Visible in Discover, but only verified @iitb.ac.in students can join.",
      avatarColor: "#a855f7",
      inviteCode: "IITBSE26",
      admin: profIitb,
      members: iitbStudents,
      type: "educational",
      requiredEmailDomains: [IITB_DOMAIN],
      joinPolicy: "approval",
      aiModeration: true,
    },
    {
      slug: "demo-campus-lounge",
      name: "Campus Lounge",
      description:
        "Open to everyone with an account and the invite code — no school email needed. A neutral space for light, off-topic chat.",
      avatarColor: "#ef4444",
      inviteCode: "LOUNGE1",
      admin: profPlacement,
      members: students,
      type: "normal",
      requiredEmailDomains: [],
      joinPolicy: "open",
      aiModeration: false,
    },
  ];

  const addedResponses: string[] = [];

  const makeCommunity = async (
    seed: (typeof communitySeeds)[number],
  ) => {
    const community = await CommunityModel.create({
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      avatarColor: seed.avatarColor,
      inviteCode: seed.inviteCode,
      type: seed.type,
      requiredEmailDomains: seed.requiredEmailDomains,
      joinPolicy: seed.joinPolicy,
      aiModeration: seed.aiModeration,
      adminIds: [seed.admin._id],
      members: membersFor(seed.members),
      bannedUserIds: [],
    });
    console.log(
      `Created ${seed.type} community "${seed.name}" (invite: ${seed.inviteCode}, policy: ${seed.joinPolicy}, for: ${
        seed.requiredEmailDomains.join(", ") || "everyone"
      })`,
    );
    return community;
  };

  const addTopic = async (
    communityId: mongoose.Types.ObjectId,
    authorId: mongoose.Types.ObjectId,
    role: Role,
    title: string,
    body: string,
    extra: { notesUrl?: string } = {},
  ) =>
    TopicModel.create({
      communityId,
      authorId,
      role,
      title,
      body,
      isClosed: false,
      ...extra,
    });

  const addResponse = async (
    topicId: mongoose.Types.ObjectId,
    communityId: mongoose.Types.ObjectId,
    authorId: mongoose.Types.ObjectId,
    role: Role,
    body: string,
    replyToId: mongoose.Types.ObjectId | null = null,
  ): Promise<mongoose.Types.ObjectId> => {
    let authorNickname: string | undefined;
    if (role === "member") {
      const community = await CommunityModel.findById(communityId);
      authorNickname = community?.members.find(
        (m) => m.userId.toString() === authorId.toString(),
      )?.nickname;
    }
    const doc = await ResponseModel.create({
      topicId,
      communityId,
      authorId,
      role,
      authorNickname,
      body,
      replyToId,
    });
    if (role === "member") addedResponses.push(doc._id.toString());
    return doc._id;
  };

  // Community 1 — VIT DBMS Doubt Corner (admin: prof_rajesh)
  {
    const community = await makeCommunity(communitySeeds[0]);
    const topic = await addTopic(
      community._id,
      profDbms._id,
      "admin",
      "Indexing vs Hashing — when is each one better?",
      "We covered B-trees and hash indexes in class. I want to hear how you would choose between the two for a real workload. Be honest, there are no wrong answers here.",
      { notesUrl: "https://drive.google.com/drive/folders/dbms-unit-3-indexing" },
    );
    const o1 = await addResponse(
      topic._id,
      community._id,
      students[0]._id,
      "member",
      "I think indexing is better for range queries since the data is sorted, while hashing is only useful for exact equality lookups.",
    );
    await addResponse(
      topic._id,
      community._id,
      students[1]._id,
      "member",
      "Wait, so hashing can't help with ORDER BY or range scans at all? That actually clears up my confusion, thanks!",
      o1,
    );
    await TopicModel.updateOne(
      { _id: topic._id },
      { $addToSet: { doubts: students[3]._id } },
    );
    await ResponseModel.updateOne(
      { _id: o1 },
      { $addToSet: { doubts: students[2]._id } },
    );
    await addResponse(
      topic._id,
      community._id,
      students[3]._id,
      "member",
      "Honestly, indexing feels easier to understand, but I remember you told us hashing has O(1) lookups. Not sure when that actually matters in practice.",
    );
    await addResponse(
      topic._id,
      community._id,
      students[5]._id,
      "member",
      "For our library catalog project we only search by title, so even linear scan was fine. Am I missing why we need indexes at all?",
    );
    const o2 = await addResponse(
      topic._id,
      community._id,
      students[8]._id,
      "member",
      "I struggle with when the index itself becomes too big to fit in memory. Does hashing solve that problem better?",
    );
    await addResponse(
      topic._id,
      community._id,
      profDbms._id,
      "admin",
      "Great discussion! Quick clarification: hashing gives O(1) for equality lookups but no ordering, so range scans force a full table scan. B-trees support ordered access, which databases rely on for ORDER BY and range predicates. Neither is 'better' — it depends on your query mix.",
      o1,
    );
    await addResponse(
      topic._id,
      community._id,
      profDbms._id,
      "admin",
      "That's exactly the point of normalization exercises — most real apps over-query. Indexes shine once you have thousands of rows. For tiny tables a scan is fine.",
      o2,
    );

    const topic2 = await addTopic(
      community._id,
      profDbms._id,
      "admin",
      "Which DBMS topic confused you the most this semester?",
      "Give me honest feedback so I can plan the revision lectures. Other students only see your nickname, and faculty can ban an author anonymously if content is reported.",
    );
    await addResponse(
      topic2._id,
      community._id,
      students[1]._id,
      "member",
      "Third normal form still confuses me. I keep mixing up transitive dependencies.",
    );
    await addResponse(
      topic2._id,
      community._id,
      students[6]._id,
      "member",
      "Query optimization and execution plans. It feels like black magic.",
    );
    await addResponse(
      topic2._id,
      community._id,
      profDbms._id,
      "admin",
      "Noted — I'll add an extra lecture on normal forms next week with plenty of examples. Thanks for speaking up!",
    );
    await addResponse(
      topic2._id,
      community._id,
      profDbms._id,
      "admin",
      "Execution plans we'll make a dedicated lab session for, since it needs hands-on practice.",
    );
  }

  // Community 2 — VIT Placements Discussion (admin: prof_anita)
  {
    const community = await makeCommunity(communitySeeds[1]);
    const topic = await addTopic(
      community._id,
      profPlacement._id,
      "admin",
      "What should we focus on for campus placements this year?",
      "Share what you genuinely feel weak at — DSA, aptitude, communication, or projects. I'll use this to shape the placement prep sessions.",
    );
    const p = await addResponse(
      topic._id,
      community._id,
      students[2]._id,
      "member",
      "My biggest fear is the aptitude round. I freeze under time pressure.",
    );
    await addResponse(
      topic._id,
      community._id,
      students[4]._id,
      "member",
      "I have no idea how to talk about my projects confidently in interviews.",
    );
    await addResponse(
      topic._id,
      community._id,
      students[7]._id,
      "member",
      "DSA. I can solve easy problems but medium-level tree questions scare me.",
    );
    await addResponse(
      topic._id,
      community._id,
      profPlacement._id,
      "admin",
      "Completely normal nerves. We'll start weekly 20-minute mock aptitude tests from next Monday. Cutting time pressure is pure practice.",
      p,
    );
    await addResponse(
      topic._id,
      community._id,
      profPlacement._id,
      "admin",
      "For project talks, bring your project to the placement cell and we'll do mock interviews — describing your own work confidently is a skill, and it's teachable.",
    );
  }

  // Community 3 — VIT Software Engineering Q&A (admin: prof_divya)
  {
    const community = await makeCommunity(communitySeeds[2]);
    const topic = await addTopic(
      community._id,
      profSe._id,
      "admin",
      "How do you feel about the group project work style?",
      "I want genuine feedback on how the group project is going — collaboration, workload, anything. You post as your nickname; if content is reported, faculty can hide it or ban the author anonymously.",
    );
    const s = await addResponse(
      topic._id,
      community._id,
      students[8]._id,
      "member",
      "Honestly I do most of the work because others don't respond in the group chat. I don't want to blame anyone, just sharing how it feels.",
    );
    await addResponse(
      topic._id,
      community._id,
      students[9]._id,
      "member",
      "I feel shy asking teammates to review my code. I'm scared of being judged for small mistakes.",
    );
    await addResponse(
      topic._id,
      community._id,
      students[10]._id,
      "member",
      "I think dividing tasks clearly at the start would help a lot. Right now it's a bit chaotic.",
    );
    await addResponse(
      topic._id,
      community._id,
      profSe._id,
      "admin",
      "Thank you for trusting the platform with this. I'll set up defined role splits and a weekly 15-minute sync so no one carries the whole load silently.",
      s,
    );
    await addResponse(
      topic._id,
      community._id,
      profSe._id,
      "admin",
      "And please remember: small mistakes are how everyone learns — no judgment here. Ever.",
    );

    // A pending join request so the approval flow can be demoed.
    await JoinRequestModel.create({
      communityId: community._id,
      userId: students[0]._id,
      nickname: "PendingOwl42",
      status: "pending",
    });

    // A banned student with a pending appeal so the appeal flow can be demoed.
    community.bannedUserIds.push(students[1]._id);
    community.bannedMembers.push({
      userId: students[1]._id,
      nickname: "QuietPanda21",
      bannedAt: new Date(),
    });
    community.members = community.members.filter(
      (m) => m.userId.toString() !== students[1]._id.toString(),
    );
    await community.save();
    await BanAppealModel.create({
      communityId: community._id,
      userId: students[1]._id,
      nickname: "QuietPanda21",
      message:
        "I am sorry for what I posted earlier. I will keep it respectful if you let me back in.",
      status: "pending",
    });
  }

  // Community 4 — NITK DBMS Doubt Corner (admin: prof_meera) — other college
  {
    const community = await makeCommunity(communitySeeds[3]);
    const topic = await addTopic(
      community._id,
      profNitk._id,
      "admin",
      "Normalization vs denormalization for a reporting database",
      "For a read-heavy analytics workload, when would you denormalise on purpose? Share your reasoning and an example.",
    );
    await addResponse(
      topic._id,
      community._id,
      nitkStudents[0]._id,
      "member",
      "I would denormalise summary tables and keep the normalized schema as the source of truth.",
    );
    await addResponse(
      topic._id,
      community._id,
      nitkStudents[1]._id,
      "member",
      "It depends on the read/write ratio — reports usually tolerate a little staleness.",
    );
  }

  // Community 5 — IITB Software Engineering Q&A (admin: prof_arjun) — other college
  {
    const community = await makeCommunity(communitySeeds[4]);
    const topic = await addTopic(
      community._id,
      profIitb._id,
      "admin",
      "How do you decide what to unit test?",
      "Genuine question for the class: where do you draw the line between unit and integration tests?",
    );
    await addResponse(
      topic._id,
      community._id,
      iitbStudents[0]._id,
      "member",
      "I unit test pure logic and use integration tests for anything that touches the database.",
    );
  }

  // Community 6 — Campus Lounge (admin: prof_anita) — open to every college
  {
    const community = await makeCommunity(communitySeeds[5]);
    const topic = await addTopic(
      community._id,
      profPlacement._id,
      "admin",
      "Studying spots on campus — share your favourites",
      "A light one: where do you actually get work done on campus? Add yours so others can try.",
    );
    await addResponse(
      topic._id,
      community._id,
      students[4]._id,
      "member",
      "The library third floor is the only place I can actually focus, honestly.",
    );
  }

  console.log(`Added ${addedResponses.length} anonymous opinions`);
  console.log("");
  console.log("══════════════════════════════════════════");
  console.log("Demo accounts ready!");
  console.log(`Common password (every demo account): ${SEED_PASSWORD}`);
  console.log("");
  console.log("Professors:");
  professors.forEach((p) => console.log(`  ${p.username}  |  ${p.email}`));
  console.log("Students (VIT — can join VIT communities):");
  students.forEach((s) => console.log(`  ${s.username}  |  ${s.schoolEmail}`));
  console.log("Students (other colleges — for the other-college communities):");
  [...nitkStudents, ...iitbStudents].forEach((s) =>
    console.log(`  ${s.username}  |  ${s.schoolEmail}`),
  );
  console.log("");

  const communities = await CommunityModel.find({ slug: /^demo-/ }).sort({
    slug: 1,
  });
  communities.forEach((c) =>
    console.log(
      `Community "${c.name}" → invite code: ${c.inviteCode} (${c.requiredEmailDomains.join(", ") || "no school email needed"})`,
    ),
  );
  console.log("══════════════════════════════════════════");

  await mongoose.disconnect();
  console.log("Done. Run `npm run dev` and sign in with any account above.");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
