const { get, all, run } = require('../config/db');
const logger = require('../utils/logger');
const { logAudit } = require('../utils/auditLogger');
const { setFlash } = require('../utils/flash');

async function listRooms(req, res, next) {
  try {
    // [SECURE CODING] Query read-only tanpa string concatenation dari input user.
    const rooms = await all(
      'SELECT id, name, location, capacity, description FROM rooms ORDER BY name ASC'
    );

    return res.render('rooms/list', {
      title: 'Manajemen Kamar',
      rooms
    });
  } catch (err) {
    return next(err);
  }
}

function showCreateRoom(req, res) {
  return res.render('rooms/form', {
    title: 'Tambah Kamar',
    formTitle: 'Tambah Kamar',
    action: '/admin/rooms',
    room: null
  });
}

async function createRoom(req, res, next) {
  try {
    const { name, location, capacity, description } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk insert data ruangan.
    const insertResult = await run('INSERT INTO rooms (name, location, capacity, description) VALUES (?, ?, ?, ?)', [
      name,
      location,
      capacity,
      description || null
    ]);

    logger.security('ROOM_CREATED', {
      actorUserId: req.session.user.id,
      roomName: name
    });

    await logAudit({
      actorUserId: req.session.user.id,
      action: 'ROOM_CREATED',
      entityType: 'room',
      entityId: insertResult.lastID,
      metadata: {
        name,
        location,
        capacity
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', 'Kamar berhasil ditambahkan.');
    return res.redirect('/admin/rooms');
  } catch (err) {
    return next(err);
  }
}

async function showEditRoom(req, res, next) {
  try {
    const { id } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk mengambil data ruangan berdasarkan ID.
    const room = await get('SELECT id, name, location, capacity, description FROM rooms WHERE id = ?', [
      id
    ]);

    if (!room) {
      return res.status(404).render('error', {
        title: 'Kamar Tidak Ditemukan',
        message: 'Data kamar tidak ditemukan.'
      });
    }

    return res.render('rooms/form', {
      title: 'Ubah Kamar',
      formTitle: 'Ubah Kamar',
      action: `/admin/rooms/${id}/update`,
      room
    });
  } catch (err) {
    return next(err);
  }
}

async function updateRoom(req, res, next) {
  try {
    const { id, name, location, capacity, description } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk update ruangan.
    const result = await run(
      `
      UPDATE rooms
      SET name = ?,
          location = ?,
          capacity = ?,
          description = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [name, location, capacity, description || null, id]
    );

    if (result.changes === 0) {
      return res.status(404).render('error', {
        title: 'Kamar Tidak Ditemukan',
        message: 'Data kamar tidak ditemukan.'
      });
    }

    logger.security('ROOM_UPDATED', {
      actorUserId: req.session.user.id,
      roomId: id
    });

    await logAudit({
      actorUserId: req.session.user.id,
      action: 'ROOM_UPDATED',
      entityType: 'room',
      entityId: id,
      metadata: {
        name,
        location,
        capacity
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', 'Kamar berhasil diperbarui.');
    return res.redirect('/admin/rooms');
  } catch (err) {
    return next(err);
  }
}

async function deleteRoom(req, res, next) {
  try {
    const { id } = req.cleanedData;

    // [SECURE CODING] Parameterized Query untuk delete ruangan.
    const result = await run('DELETE FROM rooms WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).render('error', {
        title: 'Kamar Tidak Ditemukan',
        message: 'Data kamar tidak ditemukan.'
      });
    }

    logger.security('ROOM_DELETED', {
      actorUserId: req.session.user.id,
      roomId: id
    });

    await logAudit({
      actorUserId: req.session.user.id,
      action: 'ROOM_DELETED',
      entityType: 'room',
      entityId: id,
      metadata: {},
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    setFlash(req, 'success', 'Kamar berhasil dihapus.');
    return res.redirect('/admin/rooms');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listRooms,
  showCreateRoom,
  createRoom,
  showEditRoom,
  updateRoom,
  deleteRoom
};
