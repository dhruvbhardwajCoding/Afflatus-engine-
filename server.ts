import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { exploreRoutes } from './server/routes/exploreRoutes';
import { assistantRoutes } from './server/routes/aiAssistantRoutes';
import { AiAssistantService } from './server/services/aiAssistantService';
import { getDatabase, saveDatabase } from './server/db';
import type { DBUser } from './server/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Mount Explore Modular Routes (Core Discovery Engine)
app.use('/api/explore', exploreRoutes);

// Mount C1 Personal AI Assistant Routes
app.use('/api/assistant', assistantRoutes);

// Lazy initialize Gemini API client with required User-Agent
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (err) {
      console.warn('Failed to initialize GoogleGenAI client:', err);
    }
  }
  return aiClient;
}

// ============================================================================
// IN-MEMORY DATABASE STATE (Realistic Initial Creators, Portfolios, Socials)
// ============================================================================

// In-memory OTP storage for real verified signups
const otpStore: Record<
  string,
  {
    otp: string;
    expiresAt: number;
    userData: {
      username: string;
      email: string;
      password?: string;
      name: string;
      primaryRole: string;
      seekingRoles?: string[];
    };
  }
> = {};

const INITIAL_USERS: DBUser[] = [
  {
    id: 'usr_sarah_producer',
    username: 'sarah_producer',
    email: 'sarah.lin@afflatus.app',
    passwordHash: 'password123',
    name: 'Sarah Lin',
    avatarUrl:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80',
    coverImageUrl:
      'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&auto=format&fit=crop&q=80',
    bio: 'Executive Producer with 8+ years producing commercial spots, indie feature documentaries, and high-fashion brand films across Mumbai & LA.',
    primaryRole: 'Creative Producer',
    secondaryRoles: ['Production Supervisor', 'Line Producer'],
    seekingRoles: [
      'Director of Photography (DP)',
      'Cinematographer',
      'Lead Video Editor',
      'Location Sound Recordist',
      'Colorist (DaVinci Resolve / Baselight)',
    ],
    location: 'Mumbai, Maharashtra',
    travelRadiusMiles: 500,
    dayRateUsd: 45000,
    hourlyRateUsd: 6000,
    pastBudgetTiers: ['indie', 'commercial', 'studio'],
    communicationStyle: 'fast_decider',
    userRole: 'seeker',
    profileCompleted: true,
    gearItems: [],
    portfolios: [
      {
        id: 'port_sl_1',
        title: 'Vogue Pacific Campaign 2025',
        description: 'Lead line producer coordinating 4 shoot locations.',
        linkUrl: 'https://vimeo.com/76979871',
        mediaType: 'video',
        tags: ['Fashion', 'Commercial', 'Producer'],
      },
    ],
    workLinks: [
      {
        id: 'wl_sl_1',
        title: 'Production Portfolio & Reel',
        url: 'https://vimeo.com/76979871',
        platform: 'vimeo',
        thumbnailUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400',
      },
      {
        id: 'wl_sl_2',
        title: 'Selected Commercial Case Studies',
        url: 'https://behance.net/sarahlinprod',
        platform: 'behance',
        thumbnailUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400',
      },
    ],
    socialLinks: {
      linkedin: 'https://linkedin.com/in/sarah-lin-producer',
      instagram: 'https://instagram.com/sarahlin.films',
      twitter: 'https://x.com/sarahlinprod',
      custom: 'https://sarahlinfilms.com',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_aman_dp',
    username: 'aman_sharma_dp',
    email: 'aman.sharma@cinema.io',
    passwordHash: 'password123',
    name: 'Aman Sharma',
    avatarUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
    coverImageUrl:
      'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=1200&auto=format&fit=crop&q=80',
    bio: 'Director of Photography & Lighting Cameraman specializing in moody narrative drama, high-contrast anamorphic visuals, and commercial spots.',
    primaryRole: 'Director of Photography (DP)',
    secondaryRoles: ['Cinematographer', 'Colorist (DaVinci Resolve / Baselight)'],
    seekingRoles: [
      'Director',
      'Creative Producer',
      'Screenwriter / Scriptwriter',
      'Location Sound Recordist',
      'Gaffer / Chief Lighting Technician',
    ],
    location: 'Mumbai, Maharashtra',
    travelRadiusMiles: 250,
    dayRateUsd: 35000,
    hourlyRateUsd: 4500,
    pastBudgetTiers: ['indie', 'commercial'],
    communicationStyle: 'collaborative_brainstormer',
    userRole: 'collaborator',
    profileCompleted: true,
    gearItems: [
      {
        id: 'gear_as_1',
        equipmentName: 'Sony FX6 Cinema Line 4K + GM Prime Trio',
        category: 'Camera',
        ownershipStatus: 'owned',
        specsNotes: 'Full-frame 4K 120fps, Tilta V-Mount cage, DCI 4K RAW output',
      },
      {
        id: 'gear_as_2',
        equipmentName: 'Aputure 600d Pro + Light Dome 150',
        category: 'Lighting',
        ownershipStatus: 'owned',
        specsNotes: 'High-output daylight fixture with Bowens mount softbox',
      },
      {
        id: 'gear_as_3',
        equipmentName: 'DJI RS3 Pro Gimbal + LiDAR Range Finder',
        category: 'Grip',
        ownershipStatus: 'owned',
        specsNotes: '3-axis wireless stabilization with autofocus tracking',
      },
    ],
    portfolios: [
      {
        id: 'port_as_1',
        title: 'Cinematography Showreel 2026',
        description: 'Narrative and commercial DP showreel filmed on Sony FX6 & ARRI Alexa Mini.',
        linkUrl: 'https://youtube.com/watch?v=sample-reel',
        mediaType: 'video',
        tags: ['Narrative', 'Showreel', 'Anamorphic', 'Low Light'],
      },
    ],
    workLinks: [
      {
        id: 'wl_as_1',
        title: 'Official 4K Cinematography Reel',
        url: 'https://youtube.com/watch?v=cinematography-aman',
        platform: 'youtube',
        thumbnailUrl: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400',
      },
      {
        id: 'wl_as_2',
        title: 'Lighting & Color Stills on Behance',
        url: 'https://behance.net/amansharmadp',
        platform: 'behance',
        thumbnailUrl: 'https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=400',
      },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/amansharma.dp',
      linkedin: 'https://linkedin.com/in/amansharmadp',
      pinterest: 'https://pinterest.com/amansharmacinema',
      custom: 'https://amansharma.film',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_elena_sound',
    username: 'elena_soundlab',
    email: 'elena.rostova@soundfx.org',
    passwordHash: 'password123',
    name: 'Elena Rostova',
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    coverImageUrl:
      'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1200&auto=format&fit=crop&q=80',
    bio: 'Location Sound Recordist & Audio Post Designer. Delivering crystal-clear dialog in tough acoustic environments and custom spatial 5.1/7.1 soundscapes.',
    primaryRole: 'Location Sound Recordist',
    secondaryRoles: ['Sound Designer / Audio Recordist', 'Boom Operator', 'Foley Artist'],
    seekingRoles: ['Director', 'Director of Photography (DP)', 'Lead Video Editor'],
    location: 'Bengaluru, Karnataka',
    travelRadiusMiles: 200,
    dayRateUsd: 25000,
    hourlyRateUsd: 3200,
    pastBudgetTiers: ['indie', 'commercial', 'studio'],
    communicationStyle: 'detail_reviewer',
    userRole: 'collaborator',
    profileCompleted: true,
    gearItems: [
      {
        id: 'gear_er_1',
        equipmentName: 'Sound Devices 833 8-Channel Field Recorder',
        category: 'Audio',
        ownershipStatus: 'owned',
        specsNotes: 'Ultra-low noise Kashmir preamps with 32-bit float backup',
      },
      {
        id: 'gear_er_2',
        equipmentName: 'Sennheiser MKH 416 & Schoeps CMC641 Shotgun Mics',
        category: 'Audio',
        ownershipStatus: 'owned',
        specsNotes: 'Industry standard interior/exterior dialogue capture',
      },
      {
        id: 'gear_er_3',
        equipmentName: 'Wisycom Wireless Dual Receiver + Sanken COS-11D Lavs',
        category: 'Audio',
        ownershipStatus: 'owned',
        specsNotes: 'Zero-drop wireless transmission with hidden micro lavs',
      },
    ],
    portfolios: [
      {
        id: 'port_er_1',
        title: 'Sound Design & Mix Reel',
        description: 'Dialogue restoration, spatial atmosphere, and visceral low-end Foley design.',
        linkUrl: 'https://soundcloud.com/elena-sound-design',
        mediaType: 'audio',
        tags: ['Dialogue', 'Foley', 'Atmos', '5.1 Mix'],
      },
    ],
    workLinks: [
      {
        id: 'wl_er_1',
        title: 'Feature Film Sound Mix Reel',
        url: 'https://vimeo.com/elenasoundlab',
        platform: 'vimeo',
        thumbnailUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400',
      },
      {
        id: 'wl_er_2',
        title: 'Original Sound Library on Bandcamp/Site',
        url: 'https://elenarostova.audio',
        platform: 'website',
        thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
      },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/elena.soundlab',
      linkedin: 'https://linkedin.com/in/elenarostovasound',
      facebook: 'https://facebook.com/elenasoundpost',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_marcus_editor',
    username: 'marcus_vfx_edit',
    email: 'marcus.vance@editpost.com',
    passwordHash: 'password123',
    name: 'Marcus Vance',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    coverImageUrl:
      'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=1200&auto=format&fit=crop&q=80',
    bio: 'Lead Video Editor & Colorist specializing in high-octane pacing, stylized match cuts, DaVinci Resolve color grading, and dynamic title design.',
    primaryRole: 'Lead Video Editor',
    secondaryRoles: ['Colorist (DaVinci Resolve / Baselight)', 'VFX Artist / Compositor', 'Motion Graphics / 3D Artist'],
    seekingRoles: ['Director', 'Creative Producer', 'Cinematographer', 'Music Composer / Score Producer'],
    location: 'Delhi NCR / New Delhi',
    travelRadiusMiles: 100,
    dayRateUsd: 28000,
    hourlyRateUsd: 3500,
    pastBudgetTiers: ['indie', 'commercial'],
    communicationStyle: 'autonomous_executor',
    userRole: 'collaborator',
    profileCompleted: true,
    gearItems: [
      {
        id: 'gear_mv_1',
        equipmentName: 'Apple Mac Studio M2 Ultra 128GB + DaVinci Resolve Mini Panel',
        category: 'Post-Production',
        ownershipStatus: 'owned',
        specsNotes: 'Hardware color grading console calibrated for DCI-P3 and Rec.709',
      },
    ],
    portfolios: [
      {
        id: 'port_mv_1',
        title: 'Editing & Color Grade Showcase',
        description: 'Side-by-side breakdowns of commercial spots, music videos, and trailer cuts.',
        linkUrl: 'https://vimeo.com/marcusvanceedit',
        mediaType: 'video',
        tags: ['Commercial', 'Pacing', 'Color Grade', 'DaVinci'],
      },
    ],
    workLinks: [
      {
        id: 'wl_mv_1',
        title: 'Commercial Editing Showreel',
        url: 'https://youtube.com/watch?v=marcus-edit-reel',
        platform: 'youtube',
        thumbnailUrl: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400',
      },
      {
        id: 'wl_mv_2',
        title: 'Behance Motion & Color Case Studies',
        url: 'https://behance.net/marcusvance',
        platform: 'behance',
        thumbnailUrl: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=400',
      },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/marcusvance.post',
      linkedin: 'https://linkedin.com/in/marcusvanceedit',
      twitter: 'https://x.com/marcusvance_fx',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_maya_director',
    username: 'maya_chen_films',
    email: 'maya.chen@visions.net',
    passwordHash: 'password123',
    name: 'Maya Chen',
    avatarUrl:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
    coverImageUrl:
      'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1200&auto=format&fit=crop&q=80',
    bio: 'Narrative Director & Visual Storyteller. Passionate about authentic character-driven drama, stylized worldbuilding, and innovative camera language.',
    primaryRole: 'Director',
    secondaryRoles: ['Screenwriter / Scriptwriter', 'Creative Producer'],
    seekingRoles: [
      'Director of Photography (DP)',
      'Location Sound Recordist',
      'Lead Video Editor',
      'Creative Producer',
      'Colorist (DaVinci Resolve / Baselight)',
      'Music Composer / Score Producer',
    ],
    location: 'Hyderabad, Telangana',
    travelRadiusMiles: 600,
    dayRateUsd: 40000,
    hourlyRateUsd: 5000,
    pastBudgetTiers: ['indie', 'commercial'],
    communicationStyle: 'collaborative_brainstormer',
    userRole: 'seeker',
    profileCompleted: true,
    gearItems: [],
    portfolios: [
      {
        id: 'port_mc_1',
        title: 'Echoes of Rain (Short Film)',
        description: 'Official selection at International Short Film Festival. Winner Best Narrative.',
        linkUrl: 'https://vimeo.com/mayachenfilms',
        mediaType: 'video',
        tags: ['Narrative', 'Drama', 'Directing'],
      },
    ],
    workLinks: [
      {
        id: 'wl_mc_1',
        title: 'Directing Reel & Short Films',
        url: 'https://vimeo.com/mayachenfilms',
        platform: 'vimeo',
        thumbnailUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400',
      },
      {
        id: 'wl_mc_2',
        title: 'Directorial Moodboards & Lookbooks',
        url: 'https://pinterest.com/mayachenvisions',
        platform: 'other',
        thumbnailUrl: 'https://images.unsplash.com/photo-1512790182412-b19e6d62bc39?w=400',
      },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/mayachen.directing',
      linkedin: 'https://linkedin.com/in/mayachenfilms',
      pinterest: 'https://pinterest.com/mayachenvisions',
      twitter: 'https://x.com/mayachencinema',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_jordan_uiux',
    username: 'jordan_design',
    email: 'jordan.taylor@designcraft.io',
    passwordHash: 'password123',
    name: 'Jordan Taylor',
    avatarUrl:
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=300&auto=format&fit=crop&q=80',
    coverImageUrl:
      'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&auto=format&fit=crop&q=80',
    bio: 'Product Designer & Interactive Creative Director. Specializes in elegant design systems, micro-interactions, and visual storytelling for digital media.',
    primaryRole: 'UI/UX Designer',
    secondaryRoles: ['Production Designer', 'Motion Graphics / 3D Artist'],
    seekingRoles: ['Lead Video Editor', 'Motion Graphics / 3D Artist', 'Director'],
    location: 'Bengaluru, Karnataka',
    travelRadiusMiles: 400,
    dayRateUsd: 32000,
    hourlyRateUsd: 4000,
    pastBudgetTiers: ['indie', 'commercial'],
    communicationStyle: 'detail_reviewer',
    userRole: 'collaborator',
    profileCompleted: true,
    gearItems: [],
    portfolios: [
      {
        id: 'port_jt_1',
        title: 'Interactive Media Systems',
        description: 'Design system and motion choreography for next-gen streaming interfaces.',
        linkUrl: 'https://dribbble.com/jordantaylor',
        mediaType: 'image',
        tags: ['UI/UX', 'Design System', 'Typography'],
      },
    ],
    workLinks: [
      {
        id: 'wl_jt_1',
        title: 'Dribbble Pro Portfolio',
        url: 'https://dribbble.com/jordantaylor',
        platform: 'dribbble',
        thumbnailUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=400',
      },
      {
        id: 'wl_jt_2',
        title: 'Interactive Case Studies on Behance',
        url: 'https://behance.net/jordantaylorui',
        platform: 'behance',
        thumbnailUrl: 'https://images.unsplash.com/photo-1581291518655-9523c932edcf?w=400',
      },
    ],
    socialLinks: {
      linkedin: 'https://linkedin.com/in/jordantaylordesign',
      instagram: 'https://instagram.com/jordan.creative',
      twitter: 'https://x.com/jordandesign',
      custom: 'https://jordantaylor.design',
    },
    createdAt: new Date().toISOString(),
  },
];

const database = getDatabase();

function saveDatabaseToDisk(): void {
  saveDatabase(database);
}

// ============================================================================
// AUTH REST APIS (Dual Login: Email or Username, Registration, Google Auth)
// ============================================================================

// 1. Dual Login (Email or Username)
app.post('/api/auth/login', (req, res) => {
  const { emailOrUsername, password, loginType } = req.body;

  if (!emailOrUsername || !password) {
    return res.status(400).json({ error: 'Please enter your username/email and password.' });
  }

  // Refresh from database to ensure any newly registered user is detected
  const freshDb = getDatabase();
  database.users = freshDb.users;

  const cleanQuery = emailOrUsername.trim().toLowerCase();
  const cleanUsernameQuery = cleanQuery.replace(/^@/, '');

  const user = database.users.find((u) => {
    const emailMatch = u.email && u.email.toLowerCase() === cleanQuery;
    const usernameMatch = u.username && u.username.toLowerCase() === cleanUsernameQuery;
    return emailMatch || usernameMatch;
  });

  if (!user) {
    return res.status(404).json({
      error: `No account found with that ${loginType === 'username' ? 'username' : 'email address'}. Please check your spelling or create an account.`,
    });
  }

  // Check password (allows demo passwords, verified passwordHash, or password123 fallback)
  const isPasswordValid =
    !user.passwordHash ||
    user.passwordHash === password ||
    password === 'password123' ||
    (password.length >= 6 && user.passwordHash === password.trim());

  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }

  const token = `token_${user.id}_${Date.now()}`;
  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      primaryRole: user.primaryRole,
      seekingRoles: user.seekingRoles,
      userRole: user.userRole,
      profileCompleted: user.profileCompleted,
    },
    fullProfile: user,
  });
});

// 2. Request OTP for Signup / Verification
app.post('/api/auth/send-otp', async (req, res) => {
  const { email, name, username, primaryRole, seekingRoles, password, gmailAccessToken } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Name and email are required to request an OTP.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  // Check if email already registered
  const existingEmail = database.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }

  // Generate secure 6-digit OTP
  const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

  otpStore[cleanEmail] = {
    otp: generatedOtp,
    expiresAt,
    userData: {
      username: username || name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      email: cleanEmail,
      password: password || 'password123',
      name: name.trim(),
      primaryRole: primaryRole || 'Cinematographer',
      seekingRoles: seekingRoles || ['Director', 'Lead Video Editor', 'Location Sound Recordist'],
    },
  };

  console.log(`[AUTH] Verification OTP for ${cleanEmail}: ${generatedOtp}`);

  // Attempt real email dispatch via Gmail API if OAuth token provided
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const tokenToUse = gmailAccessToken || bearerToken || process.env.GMAIL_ACCESS_TOKEN;

  let emailSentReal = false;
  let emailDeliveryNote = '';

  if (tokenToUse) {
    try {
      const subject = `Your Afflatus Verification Code: ${generatedOtp}`;
      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #141210; color: #F8F5F0; border-radius: 16px; padding: 32px; border: 1px solid #3A332C;">
          <div style="margin-bottom: 24px;">
            <span style="font-size: 11px; font-weight: 700; color: #E58B13; letter-spacing: 2px; text-transform: uppercase;">Afflatus Studio Exchange</span>
            <h1 style="font-size: 24px; font-weight: 800; margin: 8px 0 0 0; color: #F8F5F0;">Email Verification</h1>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #D8CFC4; margin-bottom: 24px;">
            Hello <strong>${name.trim()}</strong>,<br/>
            Use the following 6-digit one-time passcode (OTP) to verify your filmmaker account on Afflatus:
          </p>
          <div style="background: #231F1C; border: 2px solid #E58B13; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-family: monospace; font-weight: 800; letter-spacing: 8px; color: #F5A623;">${generatedOtp}</span>
            <div style="font-size: 12px; color: #8C7862; margin-top: 8px;">Valid for the next 10 minutes</div>
          </div>
          <p style="font-size: 12px; line-height: 1.5; color: #8C7862;">
            If you did not request this verification code, please disregard this email.
          </p>
        </div>
      `;

      const rawMessage = [
        `To: ${cleanEmail}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
        '',
        htmlBody,
      ].join('\r\n');

      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedMessage }),
      });

      if (gmailRes.ok) {
        emailSentReal = true;
        emailDeliveryNote = 'Email sent to inbox via Gmail API';
      } else {
        const errJson = await gmailRes.json().catch(() => ({}));
        console.warn('Gmail API send returned error:', errJson);
      }
    } catch (sendErr) {
      console.error('Error invoking Gmail API from backend:', sendErr);
    }
  }

  // In development/preview without direct email delivery, provide the OTP for testing.
  // In production, the OTP is strictly delivered to the user's real email inbox.
  const isDevPreview = process.env.NODE_ENV !== 'production' || process.env.ALLOW_OTP_PREVIEW === 'true';

  return res.json({
    success: true,
    message: emailSentReal 
      ? `Verification code sent to ${cleanEmail}. Please check your inbox.` 
      : `Verification code generated for ${cleanEmail}`,
    emailSentReal,
    emailDeliveryNote,
    otp: isDevPreview ? generatedOtp : undefined,
    expiresInSeconds: 600,
  });
});

// 2b. Verify OTP & Finalize Signup
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and 6-digit OTP code are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const record = otpStore[cleanEmail];

  if (!record) {
    return res.status(400).json({ error: 'No active OTP request found for this email. Please request a new code.' });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[cleanEmail];
    return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
  }

  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
  }

  // OTP verified! Create real user
  const { userData } = record;
  let cleanUsername = userData.username.trim().toLowerCase().replace(/^@/, '');
  if (cleanUsername.length < 3) {
    cleanUsername = `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}`;
  }

  const existingUsername = database.users.find((u) => u.username.toLowerCase() === cleanUsername);
  if (existingUsername) {
    cleanUsername = `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}`;
  }

  const newUser: DBUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUsername,
    email: cleanEmail,
    passwordHash: userData.password || 'password123',
    name: userData.name,
    avatarUrl: '',
    coverImageUrl: '',
    bio: '',
    primaryRole: userData.primaryRole || 'Cinematographer',
    secondaryRoles: [],
    seekingRoles: userData.seekingRoles || ['Director', 'Lead Video Editor', 'Location Sound Recordist'],
    location: 'Mumbai, Maharashtra',
    travelRadiusMiles: 150,
    dayRateUsd: 25000,
    hourlyRateUsd: 3200,
    pastBudgetTiers: ['indie', 'commercial'],
    communicationStyle: 'collaborative_brainstormer',
    userRole: 'collaborator',
    gearItems: [],
    portfolios: [],
    workLinks: [],
    socialLinks: {},
    profileCompleted: false,
    createdAt: new Date().toISOString(),
  };

  database.users.unshift(newUser);
  saveDatabaseToDisk();
  delete otpStore[cleanEmail]; // Clear OTP after success

  const token = `token_${newUser.id}_${Date.now()}`;
  return res.status(201).json({
    success: true,
    message: 'Email successfully verified and account created!',
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      name: newUser.name,
      avatarUrl: newUser.avatarUrl,
      primaryRole: newUser.primaryRole,
      seekingRoles: newUser.seekingRoles,
      userRole: newUser.userRole,
      profileCompleted: newUser.profileCompleted,
    },
    fullProfile: newUser,
  });
});

// 2c. Direct Signup (Supports immediate signup with auto-generated session)
app.post('/api/auth/signup', (req, res) => {
  const { username, email, password, name, primaryRole, seekingRoles } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  let cleanUsername = (username || name.toLowerCase().replace(/[^a-z0-9]/g, '_'))
    .trim()
    .toLowerCase()
    .replace(/^@/, '');

  if (cleanUsername.length < 3) {
    cleanUsername = `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}`;
  }

  // Check for existing user
  const existingEmail = database.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }

  const existingUsername = database.users.find((u) => u.username.toLowerCase() === cleanUsername);
  if (existingUsername) {
    cleanUsername = `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}`;
  }

  const newUser: DBUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUsername,
    email: cleanEmail,
    passwordHash: password,
    name: name.trim(),
    avatarUrl: '',
    coverImageUrl: '',
    bio: '',
    primaryRole: primaryRole || 'Cinematographer',
    secondaryRoles: [],
    seekingRoles: seekingRoles || ['Director', 'Lead Video Editor', 'Location Sound Recordist'],
    location: 'Mumbai, Maharashtra',
    travelRadiusMiles: 150,
    dayRateUsd: 25000,
    hourlyRateUsd: 3200,
    pastBudgetTiers: ['indie', 'commercial'],
    communicationStyle: 'collaborative_brainstormer',
    userRole: 'collaborator',
    gearItems: [],
    portfolios: [],
    workLinks: [],
    socialLinks: {},
    profileCompleted: false,
    createdAt: new Date().toISOString(),
  };

  database.users.unshift(newUser);
  saveDatabaseToDisk();

  const token = `token_${newUser.id}_${Date.now()}`;
  return res.status(201).json({
    success: true,
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      name: newUser.name,
      avatarUrl: newUser.avatarUrl,
      coverImageUrl: newUser.coverImageUrl,
      primaryRole: newUser.primaryRole,
      seekingRoles: newUser.seekingRoles,
      userRole: newUser.userRole,
      profileCompleted: newUser.profileCompleted,
    },
    fullProfile: newUser,
  });
});

// 3. Google / Gmail 1-Click Authentication
app.post('/api/auth/google', (req, res) => {
  const { id, email, name, avatarUrl } = req.body;
  const userEmail = (email || '').trim().toLowerCase();
  const userName = name || 'Filmmaker';

  let user = database.users.find((u) => u.email.toLowerCase() === userEmail || (id && u.id === id));
  let isNew = false;

  if (!user) {
    isNew = true;
    const baseUsername = userName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const userHandle = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;

    user = {
      id: id || `usr_g_${Date.now()}`,
      username: userHandle,
      email: userEmail,
      name: userName,
      avatarUrl: avatarUrl || '',
      coverImageUrl: '',
      bio: 'Filmmaker and visual creator exploring collaborative production opportunities.',
      primaryRole: 'Cinematographer',
      secondaryRoles: ['Director', 'Lead Video Editor'],
      seekingRoles: ['Location Sound Recordist', 'Lead Video Editor', 'Creative Producer'],
      location: 'Mumbai, Maharashtra',
      travelRadiusMiles: 150,
      dayRateUsd: 25000,
      hourlyRateUsd: 3200,
      pastBudgetTiers: ['indie', 'commercial'],
      communicationStyle: 'collaborative_brainstormer',
      userRole: 'collaborator',
      gearItems: [],
      portfolios: [],
      workLinks: [],
      socialLinks: {},
      profileCompleted: false,
      createdAt: new Date().toISOString(),
    };
    database.users.unshift(user);
    saveDatabaseToDisk();
  } else {
    if (avatarUrl) user.avatarUrl = avatarUrl;
    if (name) user.name = name;
    saveDatabaseToDisk();
  }

  const token = `token_${user.id}_${Date.now()}`;
  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      coverImageUrl: user.coverImageUrl,
      primaryRole: user.primaryRole,
      seekingRoles: user.seekingRoles,
      userRole: user.userRole,
      profileCompleted: user.profileCompleted,
      isNewUser: isNew,
    },
    fullProfile: user,
  });
});

// 4. Get Current User (Session verification)
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const userId = req.query.userId as string;

  let user: DBUser | undefined;
  if (userId) {
    user = database.users.find((u) => u.id === userId);
  } else if (token && token.startsWith('token_usr_')) {
    const parts = token.split('_');
    const extractedId = `usr_${parts[2]}`;
    user = database.users.find((u) => u.id.startsWith(extractedId));
  }

  // If not found, return 401 Not Authenticated (do not auto-login to sample users)
  if (!user) {
    return res.status(401).json({
      success: false,
      user: null,
      fullProfile: null,
      error: 'Not authenticated',
    });
  }

  return res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      primaryRole: user.primaryRole,
      seekingRoles: user.seekingRoles,
      userRole: user.userRole,
      profileCompleted: user.profileCompleted,
    },
    fullProfile: user,
  });
});

// ============================================================================
// PROFILE & CREATOR DIRECTORY APIS
// ============================================================================

// 5. List Creators with Filter by Seeking Roles / Search
app.get('/api/creators', (req, res) => {
  const { seeking, role, search, excludeUserId } = req.query;

  let results = [...database.users];

  if (excludeUserId) {
    results = results.filter((u) => u.id !== excludeUserId);
  }

  if (seeking) {
    const seekingList = (seeking as string).split(',').map((s) => s.trim().toLowerCase());
    results = results.filter((u) => {
      const pRole = u.primaryRole.toLowerCase();
      const sRoles = u.secondaryRoles.map((r) => r.toLowerCase());
      return seekingList.some((s) => pRole.includes(s) || sRoles.some((sr) => sr.includes(s)));
    });
  }

  if (role && role !== 'all') {
    const roleQuery = (role as string).toLowerCase();
    results = results.filter((u) =>
      u.primaryRole.toLowerCase().includes(roleQuery) ||
      u.secondaryRoles.some((r) => r.toLowerCase().includes(roleQuery))
    );
  }

  if (search) {
    const q = (search as string).toLowerCase();
    results = results.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.primaryRole.toLowerCase().includes(q) ||
        u.location.toLowerCase().includes(q) ||
        u.bio.toLowerCase().includes(q)
    );
  }

  return res.json({
    success: true,
    count: results.length,
    creators: results,
  });
});

// 6. Get Single Creator Profile
app.get('/api/creators/:id', (req, res) => {
  const user = database.users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Creator profile not found.' });
  }
  return res.json({ success: true, creator: user });
});

// 7. Update Creator Profile ("Making Profile" / Onboarding)
app.put('/api/creators/:id', (req, res) => {
  const userIndex = database.users.findIndex((u) => u.id === req.params.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const {
    username,
    name,
    primaryRole,
    secondaryRoles,
    email,
    seekingRoles,
    bio,
    workLinks,
    socialLinks,
    location,
    dayRateUsd,
    hourlyRateUsd,
    avatarUrl,
    coverImageUrl,
    gearItems,
    portfolios,
    travelRadiusMiles,
    communicationStyle,
    unionStatus,
    yearsExperience,
    overtimeHourlyRate,
    kitFeeIncluded,
    depositTerms,
    preferredChannel,
    emergencyContact,
    insuranceCoiReady,
    passportValid,
    willFly,
    nextAvailabilityDate,
    specialtyTags,
    cameraBodyVerified,
    lensMount,
    lightingWattage,
    audioKitSpecs,
    backupKitAvailable,
  } = req.body;

  const current = database.users[userIndex];

  // If username was changed, check for collisions
  if (username && username.toLowerCase() !== current.username.toLowerCase()) {
    const cleanU = username.trim().toLowerCase().replace(/^@/, '');
    const exists = database.users.some(
      (u) => u.id !== req.params.id && u.username.toLowerCase() === cleanU
    );
    if (exists) {
      return res.status(409).json({ error: 'Username is already taken by another creator.' });
    }
    current.username = cleanU;
  }

  if (name) current.name = name.trim();
  if (email) current.email = email.trim();
  if (primaryRole) current.primaryRole = primaryRole;
  if (secondaryRoles !== undefined) current.secondaryRoles = secondaryRoles;
  if (seekingRoles !== undefined) current.seekingRoles = seekingRoles;
  if (bio !== undefined) current.bio = bio;
  if (workLinks !== undefined) current.workLinks = workLinks;
  if (socialLinks !== undefined) current.socialLinks = socialLinks;
  if (location !== undefined) current.location = location;
  if (dayRateUsd !== undefined) current.dayRateUsd = Number(dayRateUsd);
  if (hourlyRateUsd !== undefined) current.hourlyRateUsd = Number(hourlyRateUsd);
  if (avatarUrl !== undefined) current.avatarUrl = avatarUrl;
  if (coverImageUrl !== undefined) current.coverImageUrl = coverImageUrl;
  if (gearItems !== undefined) current.gearItems = gearItems;
  if (portfolios !== undefined) current.portfolios = portfolios;
  if (travelRadiusMiles !== undefined) current.travelRadiusMiles = Number(travelRadiusMiles);
  if (communicationStyle !== undefined) current.communicationStyle = communicationStyle;
  
  // Extra fields
  Object.assign(current, {
    ...(unionStatus !== undefined && { unionStatus }),
    ...(yearsExperience !== undefined && { yearsExperience }),
    ...(overtimeHourlyRate !== undefined && { overtimeHourlyRate }),
    ...(kitFeeIncluded !== undefined && { kitFeeIncluded }),
    ...(depositTerms !== undefined && { depositTerms }),
    ...(preferredChannel !== undefined && { preferredChannel }),
    ...(emergencyContact !== undefined && { emergencyContact }),
    ...(insuranceCoiReady !== undefined && { insuranceCoiReady }),
    ...(passportValid !== undefined && { passportValid }),
    ...(willFly !== undefined && { willFly }),
    ...(nextAvailabilityDate !== undefined && { nextAvailabilityDate }),
    ...(specialtyTags !== undefined && { specialtyTags }),
    ...(cameraBodyVerified !== undefined && { cameraBodyVerified }),
    ...(lensMount !== undefined && { lensMount }),
    ...(lightingWattage !== undefined && { lightingWattage }),
    ...(audioKitSpecs !== undefined && { audioKitSpecs }),
    ...(backupKitAvailable !== undefined && { backupKitAvailable }),
  });

  current.profileCompleted = true;

  database.users[userIndex] = current;
  saveDatabaseToDisk();

  return res.json({
    success: true,
    message: 'Profile updated successfully!',
    creator: current,
  });
});

// 8. Connect / Message with Creator (Supports direct connect, project application, and task inquiry)
const handleConnectRequest = (req: express.Request, res: express.Response) => {
  const { senderId, recipientId, message, projectTitle, projectId, taskId } = req.body;

  if (!recipientId) {
    return res.status(400).json({ error: 'Recipient ID is required.' });
  }

  const recipient = database.users.find((u) => u.id === recipientId);
  if (!recipient) {
    return res.status(404).json({ error: 'Recipient not found.' });
  }

  const sid = senderId || 'usr_sarah_producer';

  // Prevent accidental duplicate connection / application requests
  const existingConn = database.connections.find((c) => {
    if (c.senderId !== sid || c.recipientId !== recipientId) return false;
    if (taskId && c.taskId === taskId) return true;
    if (projectId && !taskId && c.projectId === projectId) return true;
    if (!taskId && !projectId && !c.taskId && !c.projectId) return true;
    return false;
  });

  if (existingConn) {
    return res.json({
      success: true,
      alreadyExists: true,
      message: `You already sent a proposal to ${recipient.name} for this opportunity.`,
      connection: existingConn,
    });
  }

  const newConnection = {
    id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    senderId: sid,
    recipientId,
    message: message || `Hi ${recipient.name}, I would love to collaborate with you on ${projectTitle || 'an upcoming project'}!`,
    projectId: projectId || undefined,
    taskId: taskId || undefined,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };

  database.connections.push(newConnection);
  saveDatabaseToDisk();

  return res.json({
    success: true,
    message: `Connection proposal sent to ${recipient.name}!`,
    connection: newConnection,
  });
};

app.post('/api/connect', handleConnectRequest);
app.post('/api/connections', handleConnectRequest);

app.get('/api/connections', (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    return res.json({ success: true, connections: database.connections });
  }
  const userConns = database.connections.filter((c) => c.senderId === userId || c.recipientId === userId);
  return res.json({ success: true, connections: userConns });
});

// ============================================================================
// AI BRIEF INGESTION & STRUCTURED PARSING (Gemini 2.5 Flash / Fallback)
// ============================================================================

app.post('/api/briefs/parse', async (req, res) => {
  const { rawBriefText, optionalLocationHint, optionalBudgetHint } = req.body;

  if (!rawBriefText || typeof rawBriefText !== 'string' || rawBriefText.trim().length < 10) {
    return res.status(400).json({
      error: 'Brief text is too short. Please provide at least a sentence describing the shoot.',
    });
  }

  const aiResult = await AiAssistantService.generateContentWithFallback(
    `RAW BRIEF:\n"""\n${rawBriefText}\n"""\n\nLocation Hint: ${optionalLocationHint || 'Los Angeles, CA'}\nBudget Hint: $${optionalBudgetHint || 8000}`,
    `You are a Senior Production Supervisor in filmmaking and commercial production. Analyze the creative brief and extract structured production telemetry into strict JSON.`,
    {
      type: Type.OBJECT,
      properties: {
        projectTitle: { type: Type.STRING },
        genre: { type: Type.STRING },
        tone: { type: Type.STRING },
        targetBudgetTier: { type: Type.STRING },
        estimatedBudgetUsd: { type: Type.NUMBER },
        shootDatesWindow: { type: Type.STRING },
        shootDurationDays: { type: Type.NUMBER },
        locationRequirement: { type: Type.STRING },
        rolesNeeded: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              roleTitle: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              mustHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              niceToHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              estimatedDayRateUsd: { type: Type.NUMBER },
            },
            required: ['roleTitle', 'quantity', 'mustHaveSkills'],
          },
        },
        gearDependencies: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              itemOrSpecs: { type: Type.STRING },
              mandatory: { type: Type.BOOLEAN },
            },
            required: ['category', 'itemOrSpecs', 'mandatory'],
          },
        },
        dynamicIntentSummary: { type: Type.STRING },
      },
      required: [
        'projectTitle',
        'genre',
        'tone',
        'targetBudgetTier',
        'estimatedBudgetUsd',
        'rolesNeeded',
        'gearDependencies',
        'dynamicIntentSummary',
      ],
    }
  );

  if (aiResult?.text) {
    try {
      const parsed = JSON.parse(aiResult.text);
      return res.json(parsed);
    } catch {
      // Transition gracefully to deterministic fallback below
    }
  }

  // Deterministic Fallback Parser
  const lower = rawBriefText.toLowerCase();
  let genre = 'Narrative Cinema';
  if (lower.includes('commercial') || lower.includes('brand') || lower.includes('product')) genre = 'Commercial / Brand';
  else if (lower.includes('music video')) genre = 'Music Video';
  else if (lower.includes('fashion') || lower.includes('apparel')) genre = 'Fashion & Editorial';

  return res.json({
    projectTitle: 'Creative Production Initiative',
    genre,
    tone: lower.includes('moody') ? 'Moody & Atmospheric' : 'Modern Cinematic',
    targetBudgetTier: optionalBudgetHint && optionalBudgetHint > 15000 ? 'commercial' : 'indie',
    estimatedBudgetUsd: optionalBudgetHint || 8000,
    shootDatesWindow: 'Mid-Month Window',
    shootDurationDays: 2,
    locationRequirement: optionalLocationHint || 'Los Angeles, CA',
    rolesNeeded: [
      {
        roleTitle: 'Cinematographer',
        quantity: 1,
        mustHaveSkills: ['4K Cinema Camera Kit', 'Lighting Setup', 'Gimbal Operation'],
        niceToHaveSkills: ['Anamorphic Lens Experience'],
        estimatedDayRateUsd: 800,
      },
      {
        roleTitle: 'Sound Designer / Audio Recordist',
        quantity: 1,
        mustHaveSkills: ['Location Multitrack Audio', 'Wireless Lavs', 'Boom Mic'],
        niceToHaveSkills: ['32-bit Float Recording'],
        estimatedDayRateUsd: 750,
      },
    ],
    gearDependencies: [
      {
        category: 'Camera',
        itemOrSpecs: 'Cinema Line 4K package (Sony FX6 / RED / ARRI)',
        mandatory: true,
      },
      {
        category: 'Audio',
        itemOrSpecs: 'Dual Wireless Lavs + Shotgun Boom Kit',
        mandatory: true,
      },
    ],
    dynamicIntentSummary: 'High-production visual piece prioritizing technical excellence, verified gear, and strong creative alignment.',
  });
});


async function startServer() {
  // Phase 1 architecture split: Main Backend is API-only.
  // Frontend (Vite) runs as a separate process and talks to this service.
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'affil-main-backend',
      aiBackendUrl: process.env.AI_BACKEND_URL || 'http://localhost:3001',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Main Backend] Afflatus API running on http://localhost:${PORT}`);
    console.log(`[Main Backend] AI Backend expected at ${process.env.AI_BACKEND_URL || 'http://localhost:3001'}`);
  });
}

startServer();
