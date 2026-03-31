const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

const superAdminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, error: 'Super admin access required' });
  }
  next();
};

const channelAdmin = (channel) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  if (channel.admin.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, error: 'Channel admin access required' });
  }
  next();
};

module.exports = { adminOnly, superAdminOnly, channelAdmin };
