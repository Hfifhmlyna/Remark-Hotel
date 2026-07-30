const { get, all, run } = require('../config/db');
const logger = require('../utils/logger');
const { logAudit } = require('../utils/auditLogger');
const { setFlash } = require('../utils/flash');

function redirectReservationHome(req, res) {
  if (req.session.user.role === 'admin') {
    return res.redirect('/admin/reservations');
  }

  return res.redirect('/reservations/my');
}

async function showCreateReservation(req, res, next) {
  try {
    const capacity = Number.parseInt(req.query.capacity, 10);
    const floor = Number.parseInt(req.query.floor, 10);
    const queryParts = ['SELECT id, name, location, capacity FROM rooms'];
    const conditions = [];
    const params = [];

    if (Number.isInteger(capacity) && capacity > 0) {
      // [SECURE CODING] Parameterized Query untuk filter kapasitas kamar.
      conditions.push('capacity >= ?');
      params.push(capacity);
    }

    if (Number.isInteger(floor) && floor > 0) {
      // [SECURE CODING] Parameterized Query untuk filter lantai kamar.
      conditions.push('location LIKE ?');
      params.push(`%Lantai ${floor}%`);
    }

    if (conditions.length) {
      queryParts.push(`WHERE ${conditions.join(' AND ')}`);
    }

    queryParts.push('ORDER BY capacity ASC, name ASC');

    // [SECURE CODING] Query aman dengan parameter bind untuk pencarian kamar.
    const rooms = await all(queryParts.join(' '), params);

    const floorsRaw = await all('SELECT location FROM rooms ORDER BY location ASC');
    const floorSet = new Set();
    for (const row of floorsRaw) {
      const match = String(row.location || '').match(/Lantai\s*(\d+)/i);
      if (match) {
        floorSet.add(Number.parseInt(match[1], 10));
      }
    }
    const availableFloors = [...floorSet].filter(Number.isFinite).sort((a, b) => a - b);

    return res.render('reservations/new', {
      title: 'Ajukan Reservasi Kamar',
      rooms,
      availableFloors,
      filters: {
        capacity: Number.isInteger(capacity) && capacity > 0 ? capacity : '',
        floor: Number.isInteger(floor) && floor > 0 ? floor : ''
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function createReservation(req, res, next) {
  try {
    const { roomId, title, agenda, startTime, endTime } = req.cleanedData;
    const userId = req.session.user.id;

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
      setFlash(req, 'error', 'Rentang waktu reservasi tidak valid.');
      return res.redirect('/reservations/new');
    }

    const normalizedStart = startDate.toISOString();
    const normalizedEnd = endDate.toISOString();

    // [SECURE CODING] Parameterized Query untuk cek ruangan.
    const room = await get('SELECT id FROM rooms WHERE id = ?', [roomId]);
    if (!room) {
      setFlash(req, 'error', 'Kamar tidak ditemukan.');
      return res.redirect('/reservations/new');
    }

    // [SECURE CODING] Parameterized Query untuk cek bentrok jadwal.
    const conflict = await get(
      `
      SELECT id
      FROM reservations
      WHERE room_id = ?
        AND status IN ('pending', 'approved')
        AND NOT (end_time <= ? OR start_time >= ?)
    `,
      [roomId, normalizedStart, normalizedEnd]
    );

    if (conflict) {
      setFlash(req, 'error', 'Jadwal bentrok dengan reservasi lain.');
      return res.redirect('/reservations/new');
    }

    // [SECURE CODING] Parameterized Query untuk insert reservasi.
    const insertResult = await run(
      `
      INSERT INTO reservations (user_id, room_id, title, agenda, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `,
      [userId, roomId, title, agenda, normalizedStart, normalizedEnd]
    );

    logger.security('RESERVATION_CREATED', {
      actorUserId: userId,
      roomId,
      startTime: normalizedStart,
      endTime: normalizedEnd
    });

    await logAudit({
      actorUserId: userId,
      action: 'RESERVATION_CREATED',
      entityType: 'reservation',
      entityId: insertResult.lastID,
      metadata: {
        roomId,
        title,
        startTime: normalizedStart,
        endTime: normalizedEnd
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', 'Reservasi berhasil diajukan dan menunggu persetujuan admin.');
    return res.redirect('/reservations/my');
  } catch (err) {
    return next(err);
  }
}

async function listMyReservations(req, res, next) {
  try {
    const userId = req.session.user.id;

    // [SECURE CODING] Parameterized Query untuk memastikan user hanya melihat reservasinya sendiri.
    const reservations = await all(
      `
      SELECT r.id,
             r.title,
             r.agenda,
             r.start_time,
             r.end_time,
             r.status,
             r.admin_note,
             rm.name AS room_name,
             rm.location AS room_location
      FROM reservations r
      JOIN rooms rm ON rm.id = r.room_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `,
      [userId]
    );

    return res.render('reservations/my', {
      title: 'Reservasi Saya',
      reservations
    });
  } catch (err) {
    return next(err);
  }
}

async function listAllReservationsForAdmin(req, res, next) {
  try {
    // [SECURE CODING] Akses endpoint ini dibatasi RBAC middleware role admin.
    const reservations = await all(
      `
      SELECT r.id,
             r.title,
             r.agenda,
             r.start_time,
             r.end_time,
             r.status,
             r.admin_note,
             u.full_name AS user_name,
             u.username,
             rm.name AS room_name,
             rm.location AS room_location
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
      ORDER BY r.created_at DESC
    `
    );

    return res.render('reservations/manage', {
      title: 'Manajemen Reservasi',
      reservations
    });
  } catch (err) {
    return next(err);
  }
}

async function updateReservationStatus(req, res, next) {
  try {
    const { id, status, adminNote } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk validasi data reservasi.
    const reservation = await get('SELECT id, user_id, room_id, status FROM reservations WHERE id = ?', [
      id
    ]);

    if (!reservation) {
      return res.status(404).render('error', {
        title: 'Reservasi Tidak Ditemukan',
        message: 'Data reservasi tidak ditemukan.'
      });
    }

    // [SECURE CODING] Parameterized Query untuk update status reservasi.
    await run(
      `
      UPDATE reservations
      SET status = ?,
          admin_note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [status, adminNote || null, id]
    );

    logger.security('RESERVATION_STATUS_UPDATED', {
      actorUserId: req.session.user.id,
      reservationId: id,
      newStatus: status
    });

    await logAudit({
      actorUserId: req.session.user.id,
      action: status === 'approved' ? 'RESERVATION_APPROVED' : 'RESERVATION_REJECTED',
      entityType: 'reservation',
      entityId: id,
      metadata: {
        adminNote: adminNote || null
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', `Reservasi berhasil di-${status}.`);
    return res.redirect('/admin/reservations');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  redirectReservationHome,
  showCreateReservation,
  createReservation,
  listMyReservations,
  listAllReservationsForAdmin,
  updateReservationStatus
};
