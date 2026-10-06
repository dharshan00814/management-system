require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const rawClientUrl = process.env.CLIENT_URL || '*';
const clientOrigins = rawClientUrl === '*'
  ? '*'
  : rawClientUrl.split(',').map(url => url.trim().replace(/\/+$/, ''));

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || clientOrigins === '*') return callback(null, true);
    const normalized = origin.replace(/\/+$/, '');
    if (Array.isArray(clientOrigins) && clientOrigins.includes(normalized)) {
      return callback(null, true);
    }
    console.warn(`[Express CORS Blocked] Origin: ${origin}. Allowed:`, clientOrigins);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const supabase = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

// Production Root Endpoint (Fixes "Cannot GET /" on Render)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Hyna WebRTC Signaling Server',
  });
});

// Production Health Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    activeRooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: clientOrigins,
    methods: ['GET', 'POST'],
    credentials: clientOrigins !== '*',
  },
  transports: ['polling', 'websocket'],
  pingTimeout: 30000,
  pingInterval: 10000,
});

// In-Memory Room & Participant Registry
// rooms: Map<roomId, { roomId, hostId, status: 'WAITING'|'LIVE'|'ENDED', participants: Map<socketId, Participant> }>
const rooms = new Map();
// socketToRoom: Map<socketId, { roomId, userId }>
const socketToRoom = new Map();

// Helper: Query Database Meeting Details
async function getDbMeeting(roomId) {
  if (!supabase || !roomId) return null;
  const cleanId = String(roomId).trim();
  try {
    // 1. Search by meeting_room_id
    const { data: byRoomId } = await supabase
      .from('meetings')
      .select('*')
      .ilike('meeting_room_id', cleanId)
      .maybeSingle();

    if (byRoomId) return byRoomId;

    // 2. Search by meeting_link
    const { data: byLink } = await supabase
      .from('meetings')
      .select('*')
      .ilike('meeting_link', `%${cleanId}%`)
      .maybeSingle();

    if (byLink) return byLink;

    // 3. Search by id
    const { data: byId } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle();

    return byId || null;
  } catch (err) {
    console.error(`[DB Error] getDbMeeting for ${cleanId}:`, err.message);
    return null;
  }
}

// Helper: Update Meeting Status in Database
async function updateDbMeetingStatus(roomId, status) {
  if (!supabase || !roomId) return;
  const cleanId = String(roomId).trim();
  try {
    const dbStatus = status === 'LIVE' ? 'ongoing' : status === 'ENDED' ? 'completed' : 'scheduled';
    const now = new Date().toISOString();
    const updates = { status: dbStatus, updated_at: now };
    if (status === 'LIVE') updates.started_at = now;
    if (status === 'ENDED') updates.ended_at = now;

    await supabase
      .from('meetings')
      .update(updates)
      .or(`id.eq.${cleanId},meeting_room_id.ilike.${cleanId},meeting_link.ilike.%${cleanId}%`);
    console.log(`[DB] Updated meeting ${cleanId} status to: ${dbStatus}`);
  } catch (err) {
    console.error(`[DB Error] updateDbMeetingStatus for ${cleanId}:`, err.message);
  }
}

console.log('[Socket.IO] initialized with origins:', clientOrigins);

io.on('connection', (socket) => {
  console.log('[Socket.IO] CONNECTED', {
    socketId: socket.id,
    transport: socket.conn?.transport?.name,
    origin: socket.handshake?.headers?.origin,
  });

  // 1. Join Room
  socket.on('join-room', async ({ roomId, user, micEnabled = true, videoEnabled = true }) => {
    if (!roomId || !user || !user.userId) {
      return socket.emit('error', { message: 'Invalid room or user credentials' });
    }

    // Fetch database meeting to determine true host and validity
    let dbMeeting = await getDbMeeting(roomId);

    // Fetch real authenticated profile from database if available
    let memberProfile = null;
    if (supabase && user.userId) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.userId)
          .maybeSingle();
        if (profile) {
          memberProfile = profile;
        }
      } catch (e) {
        console.warn('[Server] Error fetching user profile:', e.message);
      }
    }

    const resolvedUserId = memberProfile?.id || user.userId;
    const resolvedName = memberProfile?.name || user.name || 'Member';
    const resolvedAvatar = memberProfile?.avatar || user.avatar || '';
    const resolvedRole = memberProfile?.role || user.role || 'member';
    const resolvedDesignation = memberProfile?.designation || user.designation || 'Software Engineer';

    console.log(`[Join] User ${resolvedName} (${resolvedUserId}) joining room ${roomId}`);

    let room = rooms.get(roomId);
    if (!room) {
      const hostId = dbMeeting?.host_id || dbMeeting?.created_by || resolvedUserId;
      room = {
        roomId,
        hostId,
        status: 'WAITING',
        allowScreenShare: true,
        participants: new Map(),
      };
      rooms.set(roomId, room);
    } else {
      // If user is reconnecting under a new socket ID, replace previous socket entry cleanly
      for (const [existingSocketId, existingParticipant] of room.participants.entries()) {
        if (existingParticipant.userId === resolvedUserId && existingSocketId !== socket.id) {
          console.log(`[Rejoin] User ${resolvedName} reconnecting. Replacing old socket ${existingSocketId} with ${socket.id}`);
          room.participants.delete(existingSocketId);
          socketToRoom.delete(existingSocketId);
        }
      }
    }

    // Determine host status: strictly verify if user is host
    const isHost = (room.hostId === resolvedUserId) || (dbMeeting && (dbMeeting.host_id === resolvedUserId || dbMeeting.created_by === resolvedUserId));
    if (isHost && !room.hostId) {
      room.hostId = resolvedUserId;
    }

    // If meeting is not yet LIVE, mark it LIVE once someone joins
    if (room.status === 'WAITING') {
      room.status = 'LIVE';
      updateDbMeetingStatus(roomId, 'LIVE');
    }

    const participantData = {
      socketId: socket.id,
      userId: resolvedUserId,
      name: resolvedName,
      avatar: resolvedAvatar,
      role: resolvedRole,
      designation: resolvedDesignation,
      micEnabled: Boolean(micEnabled),
      videoEnabled: Boolean(videoEnabled),
      isScreenSharing: false,
      isSpeaking: false,
      isHost: Boolean(isHost),
      joinedAt: new Date().toISOString(),
    };

    socket.join(roomId);
    room.participants.set(socket.id, participantData);
    socketToRoom.set(socket.id, { roomId, userId: resolvedUserId });

    // Send existing participants list and room info to the joining client
    const existingParticipants = Array.from(room.participants.values()).filter(p => p.socketId !== socket.id);
    socket.emit('room-joined', {
      roomId,
      isHost,
      hostId: room.hostId,
      status: room.status,
      allowScreenShare: room.allowScreenShare !== false,
      participants: existingParticipants,
      yourParticipantInfo: participantData,
    });

    // Broadcast participant_joined to all other clients in the room
    socket.to(roomId).emit('participant_joined', participantData);
    console.log(`[Room ${roomId}] Active participants: ${room.participants.size}`);
  });

  // 2. WebRTC Signaling: Offer
  socket.on('offer', ({ target, sdp }) => {
    // target can be a socketId
    if (target) {
      io.to(target).emit('offer', {
        callerSocketId: socket.id,
        sdp,
      });
    }
  });

  // 3. WebRTC Signaling: Answer
  socket.on('answer', ({ target, sdp }) => {
    if (target) {
      io.to(target).emit('answer', {
        responderSocketId: socket.id,
        sdp,
      });
    }
  });

  // 4. WebRTC Signaling: ICE Candidate
  socket.on('ice-candidate', ({ target, candidate }) => {
    if (target) {
      io.to(target).emit('ice-candidate', {
        senderSocketId: socket.id,
        candidate,
      });
    }
  });

  // 5. Media Toggle (Camera / Mic / Screen Share)
  socket.on('media-toggle', ({ micEnabled, videoEnabled, isScreenSharing }) => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (participant) {
      if (isScreenSharing && !participant.isHost && room.allowScreenShare === false) {
        return socket.emit('error', { message: 'Screen sharing has been disabled by the meeting host.' });
      }

      if (micEnabled !== undefined) participant.micEnabled = micEnabled;
      if (videoEnabled !== undefined) participant.videoEnabled = videoEnabled;
      if (isScreenSharing !== undefined) participant.isScreenSharing = isScreenSharing;

      io.to(info.roomId).emit('participant-media-changed', {
        socketId: socket.id,
        userId: info.userId,
        micEnabled: participant.micEnabled,
        videoEnabled: participant.videoEnabled,
        isScreenSharing: participant.isScreenSharing,
      });
    }
  });

  // 6. Voice Activity / Speaking Detection
  socket.on('speaking-change', ({ isSpeaking }) => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.isSpeaking = Boolean(isSpeaking);
      socket.to(info.roomId).emit('participant-speaking-changed', {
        socketId: socket.id,
        userId: info.userId,
        isSpeaking: participant.isSpeaking,
      });
    }
  });

  // 7. Real-Time Chat Message
  socket.on('send-message', (messagePayload) => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const enrichedMessage = {
      ...messagePayload,
      id: messagePayload.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      roomId: info.roomId,
      timestamp: messagePayload.timestamp || new Date().toISOString(),
    };

    io.to(info.roomId).emit('receive-message', enrichedMessage);
  });

  // 8. Host Control: Mute Participant
  socket.on('host-mute-participant', ({ targetSocketId, targetUserId }) => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    const caller = room.participants.get(socket.id);
    if (!caller || !caller.isHost) {
      return socket.emit('error', { message: 'Only the meeting host can mute participants.' });
    }

    // Find target
    const targetSocket = targetSocketId || Array.from(room.participants.entries()).find(([sId, p]) => p.userId === targetUserId)?.[0];
    if (targetSocket) {
      const targetParticipant = room.participants.get(targetSocket);
      if (targetParticipant) {
        targetParticipant.micEnabled = false;
        io.to(targetSocket).emit('forced-mute', { by: caller.name });
        io.to(info.roomId).emit('participant-media-changed', {
          socketId: targetSocket,
          userId: targetParticipant.userId,
          micEnabled: false,
          videoEnabled: targetParticipant.videoEnabled,
          isScreenSharing: targetParticipant.isScreenSharing,
        });
        console.log(`[Host Control] Host ${caller.name} muted ${targetParticipant.name}`);
      }
    }
  });

  // 8b. Host Control: Mute All Participants
  socket.on('host-mute-all', () => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    const caller = room.participants.get(socket.id);
    if (!caller || !caller.isHost) {
      return socket.emit('error', { message: 'Only the meeting host can mute all participants.' });
    }

    for (const [pSocketId, p] of room.participants.entries()) {
      if (!p.isHost && p.micEnabled) {
        p.micEnabled = false;
        io.to(pSocketId).emit('forced-mute', { by: caller.name });
        io.to(info.roomId).emit('participant-media-changed', {
          socketId: pSocketId,
          userId: p.userId,
          micEnabled: false,
          videoEnabled: p.videoEnabled,
          isScreenSharing: p.isScreenSharing,
        });
      }
    }
    console.log(`[Host Control] Host ${caller.name} muted all participants in ${info.roomId}`);
  });

  // 8c. Host Control: Toggle Screen Sharing Permission
  socket.on('host-toggle-screenshare-permission', ({ allowed }) => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    const caller = room.participants.get(socket.id);
    if (!caller || !caller.isHost) {
      return socket.emit('error', { message: 'Only the meeting host can configure screen sharing permissions.' });
    }

    room.allowScreenShare = Boolean(allowed);
    io.to(info.roomId).emit('screenshare-permission-changed', {
      allowScreenShare: room.allowScreenShare,
      by: caller.name,
    });
    console.log(`[Host Control] Host ${caller.name} set allowScreenShare to ${room.allowScreenShare} in ${info.roomId}`);
  });

  // 9. Host Control: Remove Participant
  socket.on('host-remove-participant', ({ targetSocketId, targetUserId }) => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    const caller = room.participants.get(socket.id);
    if (!caller || !caller.isHost) {
      return socket.emit('error', { message: 'Only the meeting host can remove participants.' });
    }

    const targetSocket = targetSocketId || Array.from(room.participants.entries()).find(([sId, p]) => p.userId === targetUserId)?.[0];
    if (targetSocket) {
      const targetParticipant = room.participants.get(targetSocket);
      io.to(targetSocket).emit('removed-by-host', {
        reason: 'You were removed from the meeting by the host.',
      });
      room.participants.delete(targetSocket);
      socketToRoom.delete(targetSocket);
      io.sockets.sockets.get(targetSocket)?.leave(info.roomId);

      io.to(info.roomId).emit('participant_left', {
        socketId: targetSocket,
        userId: targetParticipant?.userId,
        name: targetParticipant?.name,
      });
      console.log(`[Host Control] Host ${caller.name} removed ${targetParticipant?.name}`);
    }
  });

  // 10. Host Control: End Meeting
  socket.on('host-end-meeting', async () => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    const caller = room.participants.get(socket.id);
    if (!caller || !caller.isHost) {
      return socket.emit('error', { message: 'Only the meeting host can end the meeting.' });
    }

    room.status = 'ENDED';
    await updateDbMeetingStatus(info.roomId, 'ENDED');

    io.to(info.roomId).emit('meeting-ended', {
      by: caller.name,
      message: 'The meeting has been ended by the host.',
    });

    // Clear room participants
    for (const [pSocketId] of room.participants) {
      socketToRoom.delete(pSocketId);
      io.sockets.sockets.get(pSocketId)?.leave(info.roomId);
    }
    room.participants.clear();
    rooms.delete(info.roomId);
    console.log(`[Host Control] Meeting ${info.roomId} ended by host ${caller.name}`);
  });

  // 11. Disconnect / Leave
  socket.on('disconnect', () => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;

    const { roomId, userId } = info;
    const room = rooms.get(roomId);

    if (room) {
      const participant = room.participants.get(socket.id);
      room.participants.delete(socket.id);
      socketToRoom.delete(socket.id);

      console.log(`[Leave] User ${participant?.name || userId} disconnected from ${roomId}`);

      socket.to(roomId).emit('participant_left', {
        socketId: socket.id,
        userId: participant?.userId || userId,
        name: participant?.name || 'Member',
      });

      // If room is completely empty, clean it up after a grace period
      if (room.participants.size === 0) {
        setTimeout(async () => {
          const freshRoom = rooms.get(roomId);
          if (freshRoom && freshRoom.participants.size === 0) {
            freshRoom.status = 'ENDED';
            await updateDbMeetingStatus(roomId, 'ENDED');
            rooms.delete(roomId);
            console.log(`[Room Cleanup] Empty room ${roomId} closed`);
          }
        }, 15000);
      }
    }
  });
});

// Render Load Balancer Timeout Configuration (Prevents 502 Bad Gateway / Connection Reset)
server.keepAliveTimeout = 120000; // 120 seconds (greater than Render proxy's 90s timeout)
server.headersTimeout = 125000;   // 125 seconds (must be > keepAliveTimeout)

if (!process.env.VERCEL) {
  server.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`🚀 WebRTC & Meeting Signaling Server running on ${HOST}:${PORT}`);
    console.log(`📡 Health Check: http://${HOST}:${PORT}/health`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
