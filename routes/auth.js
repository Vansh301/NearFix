const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');

// Register GET
router.get('/register', (req, res) => {
    res.render('auth/register');
});

router.post('/register', async (req, res) => {
    try {
        const { fullName, email, phone, role, password } = req.body;
        const user = new User({ 
            fullName, 
            email, 
            phone, 
            role,
            address: {
                location: {
                    type: 'Point',
                    coordinates: [77.2090, 28.6139] // Default to Delhi
                }
            }
        });
        console.log('Attempting to register user:', user);
        await User.register(user, password);
        
        passport.authenticate('local')(req, res, () => {
            if (role === 'provider') {
                res.redirect('/provider/setup');
            } else {
                req.flash('success', 'Registration successful!');
                res.redirect('/');
            }
        });
    } catch (err) {
        console.error('Registration error details:', err);
        req.flash('error', err.message);
        res.redirect('/auth/register');
    }
});

// Login GET
router.get('/login', (req, res) => {
    res.render('auth/login');
});

// Login POST
router.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/auth/login',
    failureFlash: true
}));

// Logout
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return next(err);
        req.flash('success', 'Logged out successfully!');
        res.redirect('/');
    });
});

// Forgot Password GET
router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password');
});

// Forgot Password POST
router.post('/forgot-password', async (req, res) => {
    try {
        const crypto = require('crypto');
        const token = crypto.randomBytes(20).toString('hex');
        
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            req.flash('error', 'No account with that email address exists.');
            return res.redirect('/auth/forgot-password');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // SIMULATION: In a real app, you would send an email here using nodemailer.
        // For development, we log the link to the console.
        const resetUrl = `http://${req.headers.host}/auth/reset-password/${token}`;
        console.log('=========================================');
        console.log('PASSWORD RESET REQUESTED');
        console.log('User:', user.email);
        console.log('Reset Link:', resetUrl);
        console.log('=========================================');

        req.flash('success', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
        res.redirect('/auth/forgot-password');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/auth/forgot-password');
    }
});

// Reset Password GET
router.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({ 
            resetPasswordToken: req.params.token, 
            resetPasswordExpires: { $gt: Date.now() } 
        });
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }
        res.render('auth/reset-password', { token: req.params.token });
    } catch (err) {
        res.redirect('/auth/forgot-password');
    }
});

// Reset Password POST
router.post('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({ 
            resetPasswordToken: req.params.token, 
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('back');
        }

        if (req.body.password !== req.body.confirm) {
            req.flash('error', 'Passwords do not match.');
            return res.redirect('back');
        }

        // Set the new password using passport-local-mongoose method
        await user.setPassword(req.body.password);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        req.flash('success', 'Success! Your password has been changed.');
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to reset password.');
        res.redirect('/auth/forgot-password');
    }
});

module.exports = router;
