const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');

const { isAuthenticated } = require('../middleware/auth');

// Main Chat Page - Lists all conversations
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Find all unique users this person has chatted with
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [{ sender: userId }, { receiver: userId }]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$sender", userId] },
                            "$receiver",
                            "$sender"
                        ]
                    },
                    lastMessage: { $first: "$content" },
                    lastSender: { $first: "$sender" },
                    timestamp: { $first: "$createdAt" },
                    unreadCount: { 
                        $sum: { 
                            $cond: [
                                { $and: [ { $eq: ["$receiver", userId] }, { $eq: ["$isRead", false] } ] }, 
                                1, 
                                0 
                            ] 
                        } 
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'otherUser'
                }
            },
            { $unwind: '$otherUser' }
        ]);

        res.render('chat', { chats: conversations, activeChat: null, messages: [], activeBooking: null });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Specific Chat Page
router.get('/:otherUserId', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const otherUserId = req.params.otherUserId;

        const otherUser = await User.findById(otherUserId);
        if (!otherUser) return res.redirect('/chat');

        // Fetch all conversations for sidebar
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [{ sender: userId }, { receiver: userId }]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$sender", userId] },
                            "$receiver",
                            "$sender"
                        ]
                    },
                    lastMessage: { $first: "$content" },
                    lastSender: { $first: "$sender" },
                    timestamp: { $first: "$createdAt" },
                    unreadCount: { 
                        $sum: { 
                            $cond: [
                                { $and: [ { $eq: ["$receiver", userId] }, { $eq: ["$isRead", false] } ] }, 
                                1, 
                                0 
                            ] 
                        } 
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'otherUser'
                }
            },
            { $unwind: '$otherUser' }
        ]);

        if (req.params.otherUserId) {
            conversations.forEach(c => {
                if (c._id.toString() === req.params.otherUserId) {
                    c.unreadCount = 0;
                }
            });
        }

        // Fetch messages for this specific chat
        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId }
            ]
        })
        .populate('bookingId')
        .sort({ createdAt: 1 });

        // Mark messages as read
        await Message.updateMany(
            { sender: otherUserId, receiver: userId, isRead: false },
            { $set: { isRead: true } }
        );

        // RECALCULATE Unread Count for the header badge
        res.locals.unreadCount = await Message.countDocuments({ 
            receiver: userId, 
            isRead: false 
        });

        // Find the latest booking between these two users to link quotes
        const Booking = require('../models/Booking');
        const Provider = require('../models/Provider');
        
        let providerId = null;
        if (otherUser.role === 'provider') {
            const provider = await Provider.findOne({ userId: otherUser._id });
            providerId = provider ? provider._id : null;
        } else if (req.user.role === 'provider') {
            const provider = await Provider.findOne({ userId: req.user._id });
            providerId = provider ? provider._id : null;
        }

        const activeBooking = await Booking.findOne({
            $or: [
                { customerId: userId, providerId: providerId },
                { customerId: otherUser._id, providerId: providerId }
            ],
            status: { $in: ['pending', 'accepted'] }
        }).sort({ createdAt: -1 });

        res.render('chat', { chats: conversations, activeChat: otherUser, messages, activeBooking });
    } catch (err) {
        console.error(err);
        res.redirect('/chat');
    }
});

module.exports = router;
