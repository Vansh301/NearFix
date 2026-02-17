/**
 * NearFix Authentication & Authorization Middleware
 * Centralized protection for client, worker, and admin routes.
 */

const authMiddleware = {
    /**
     * Basic Authentication Guard
     * Ensures user is logged in before accessing private features.
     */
    isAuthenticated: (req, res, next) => {
        if (req.isAuthenticated()) {
            return next();
        }
        req.flash('error', 'Please login to continue.');
        res.redirect('/auth/login');
    },

    /**
     * Customer Profile Guard
     * Protects customer-only features like posting requirements and viewing bookings.
     */
    isCustomer: (req, res, next) => {
        if (req.isAuthenticated() && req.user.role === 'customer') {
            return next();
        }
        req.flash('error', 'Authentication failed. Please login as a Customer.');
        res.redirect('/auth/login');
    },

    /**
     * Service Provider Guard
     * Ensures only verified workers can access lead dashboards and earnings.
     */
    isProvider: (req, res, next) => {
        if (req.isAuthenticated() && req.user.role === 'provider') {
            return next();
        }
        req.flash('error', 'Access denied. Professional account required.');
        res.redirect('/auth/login');
    },

    /**
     * System Admin Guard
     * High-level protection for global platform management.
     */
    isAdmin: (req, res, next) => {
        if (req.isAuthenticated() && req.user.role === 'admin') {
            return next();
        }
        req.flash('error', 'Unauthorized access. Administrator privileges required.');
        res.redirect('/');
    }
};

module.exports = authMiddleware;
