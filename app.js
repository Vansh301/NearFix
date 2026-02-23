require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const session = require('express-session');
const flash = require('express-flash');
const methodOverride = require('method-override');
const morgan = require('morgan');
const http = require('http');
const socketio = require('socket.io');

// Config
const connectDB = require('./config/db');
const User = require('./models/User');
const Message = require('./models/Message');

// Initialize app
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Connect to Database
connectDB();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(methodOverride('_method'));

// Session Config
app.use(session({
    secret: process.env.SESSION_SECRET || 'nearfix_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    }
}));

app.use(flash());

// Passport Config
app.use(passport.initialize());
app.use(passport.session());
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Global Variables
app.use(async (req, res, next) => {
    // Always initialize unreadCount to 0
    res.locals.unreadCount = 0;
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    
    if (req.user) {
        try {
            res.locals.unreadCount = await Message.countDocuments({ 
                receiver: req.user._id, 
                isRead: false 
            });
        } catch (err) {
            console.error('Error fetching unread count:', err);
        }
    }
    next();
});

// Socket.io context
app.set('io', io);

// Routes
console.log('--- Initializing Application Routes ---');
console.log('Mounting /');
app.use('/', require('./routes/index'));
console.log('Mounting /auth');
app.use('/auth', require('./routes/auth'));
console.log('Mounting /user');
app.use('/user', require('./routes/user'));
console.log('Mounting /provider');
app.use('/provider', require('./routes/provider'));
console.log('Mounting /admin');
app.use('/admin', require('./routes/admin'));
console.log('Mounting /chat');
app.use('/chat', require('./routes/chat'));
console.log('Mounting /payment');
app.use('/payment', require('./routes/payment'));

// Socket.io logic
io.on('connection', (socket) => {
    console.log('New WebSocket connection');
    
    socket.on('join', async (room) => {
        if (!room) return;
        socket.join(room);
        // Also join a room for the user's specific ID to receive notifications
        // We join with the user- prefix for consistent targeting in routes
        socket.join(`user-${room}`);

        // NEW: Check for unread messages immediately after login/reconnect
        // Only run if the room ID is a valid 24-char ObjectId (meaning it's a private user room)
        if (room && room.length === 24) {
            try {
                const Message = require('./models/Message');
                const unreadCount = await Message.countDocuments({ receiver: room, isRead: false });
                
                if (unreadCount > 0) {
                    socket.emit('notification', {
                        title: 'Welcome Back! 👋',
                        content: `You have ${unreadCount} unread message${unreadCount > 1 ? 's' : ''} waiting for you.`,
                        type: 'message',
                        senderId: null // Global notification
                    });
                }
            } catch (err) {
                console.error('Error checking unread messages on join:', err);
            }
        }
    });

    socket.on('sendMessage', async (data) => {
        try {
            const Booking = require('./models/Booking');
            const Provider = require('./models/Provider');
            
            let bookingId = data.bookingId;
            
            // If it's a quote but no booking exists, create a pending booking first
            if (data.messageType === 'quote' && (!bookingId || !/^[0-9a-fA-F]{24}$/.test(bookingId))) {
                const sender = await User.findById(data.senderId);
                const receiver = await User.findById(data.receiverId);
                
                let providerObj, customerId;
                if (sender.role === 'provider') {
                    providerObj = await Provider.findOne({ userId: sender._id });
                    customerId = receiver._id;
                } else {
                    providerObj = await Provider.findOne({ userId: receiver._id });
                    customerId = sender._id;
                }

                if (providerObj) {
                    const newBooking = new Booking({
                        customerId: customerId,
                        providerId: providerObj._id,
                        service: {
                            category: 'Marketplace Lead',
                            description: data.message
                        },
                        bookingDate: new Date(),
                        bookingTime: 'ASAP',
                        status: 'pending',
                        proposedAmount: data.proposedPrice || 0,
                        notes: 'Started from Chat Offer'
                    });
                    const savedBooking = await newBooking.save();
                    bookingId = savedBooking._id;
                }
            }

            const messageData = {
                sender: data.senderId,
                receiver: data.receiverId,
                content: data.message,
                messageType: data.messageType || 'text',
                proposedPrice: data.proposedPrice || null,
                bookingId: bookingId
            };
            
            const newMessage = new Message(messageData);
            await newMessage.save();
            
            // 1. Emit to the chat room
            io.to(data.room).emit('message', {
                sender: data.senderId,
                content: data.message,
                messageType: newMessage.messageType,
                proposedPrice: newMessage.proposedPrice,
                bookingId: newMessage.bookingId, // Pass back the new booking ID
                createdAt: newMessage.createdAt
            });

            // 2. Emit notification
            const sender = await User.findById(data.senderId);
            const isQuote = newMessage.messageType === 'quote';
            io.to(`user-${data.receiverId}`).emit('notification', {
                title: isQuote ? 'New Price Quote! 🏷️' : sender.fullName,
                content: isQuote ? `${sender.fullName} sent a quote for ₹${newMessage.proposedPrice}` : data.message,
                senderId: data.senderId.toString(),
                senderName: sender.fullName,
                type: isQuote ? 'success' : 'message',
                bookingId: bookingId
            });
        } catch (err) {
            console.error('Socket Error:', err);
        }
    });

    socket.on('acceptQuote', async (data) => {
        try {
            const Booking = require('./models/Booking');
            const booking = await Booking.findById(data.bookingId);
            if (booking) {
                booking.paymentMethod = data.method || 'cash';
                booking.paymentStatus = booking.paymentMethod === 'online' ? 'paid' : 'pending';
                booking.status = 'accepted';
                booking.totalAmount = data.amount;
                await booking.save();

                io.to(data.room).emit('quoteUpdate', {
                    bookingId: data.bookingId,
                    status: 'accepted',
                    method: booking.paymentMethod,
                    message: `Price Accepted (${booking.paymentMethod === 'cash' ? 'Cash' : 'Online'}) - Waiting for Worker Confirmation`
                });

                // Send Notification to Worker
                const populatedBooking = await booking.populate('providerId customerId');
                const providerUserId = populatedBooking.providerId.userId;
                const clientName = populatedBooking.customerId.fullName;
                
                io.to(`user-${providerUserId}`).emit('notification', {
                    title: 'Payment Approved! 💰',
                    content: `${clientName} has accepted your quote. Please give the final seal to confirm the booking.`,
                    type: 'success',
                    bookingId: booking._id
                });
            }
        } catch (err) {
            console.error('Accept Quote Error:', err);
        }
    });

    socket.on('finalConfirmBooking', async (data) => {
        try {
            const Booking = require('./models/Booking');
            const booking = await Booking.findById(data.bookingId);
            if (booking && booking.status === 'accepted') {
                booking.status = 'confirmed';
                await booking.save();

                io.to(data.room).emit('quoteUpdate', {
                    bookingId: data.bookingId,
                    status: 'confirmed',
                    message: 'Booking Confirmed!'
                });

                // Send Notification to Client
                const populatedBooking = await booking.populate('providerId customerId');
                const customerUserId = populatedBooking.customerId._id;
                const Provider = require('./models/Provider');
                const provider = await Provider.findById(populatedBooking.providerId._id).populate('userId');
                const workerName = provider.userId.fullName;

                io.to(`user-${customerUserId}`).emit('notification', {
                    title: 'Booking Finalized! 🎉',
                    content: `${workerName} has confirmed your booking. See you soon!`,
                    type: 'success',
                    bookingId: booking._id
                });
            }
        } catch (err) {
            console.error('Final Confirm Error:', err);
        }
    });

    socket.on('clientPay', async (data) => {
        try {
            const Booking = require('./models/Booking');
            const Provider = require('./models/Provider');
            const booking = await Booking.findById(data.bookingId);
            
            if (booking && booking.paymentStatus === 'pending') {
                booking.paymentMethod = data.method || 'online';
                booking.paymentStatus = 'paid';
                await booking.save();

                // Increment earnings if status is completed
                if (booking.status === 'completed') {
                    await Provider.findByIdAndUpdate(booking.providerId, {
                        $inc: { earnings: booking.totalAmount || 0 }
                    });
                }

                io.to(data.room).emit('quoteUpdate', {
                    bookingId: data.bookingId,
                    status: booking.status,
                    paymentStatus: 'paid',
                    message: `Payment Confirmed (${booking.paymentMethod === 'cash' ? 'Cash' : 'Online'})`
                });

                // Send Message to Worker
                const Message = require('./models/Message');
                const user = await User.findById(booking.customerId);
                const payMsg = new Message({
                    sender: booking.customerId,
                    receiver: (await booking.populate('providerId')).providerId.userId,
                    content: `I've confirmed payment via ${booking.paymentMethod === 'cash' ? 'Cash' : 'Online'}. ✅`,
                    messageType: 'text',
                    bookingId: booking._id
                });
                await payMsg.save();

                // Notify Worker
                const providerUserId = (await booking.populate('providerId')).providerId.userId;
                io.to(`user-${providerUserId}`).emit('notification', {
                    title: 'Payment Confirmed! 💰',
                    content: `${user.fullName} has paid for the service. Check your balance!`,
                    type: 'success',
                    bookingId: booking._id
                });
            }
        } catch (err) {
            console.error('Client Pay Error:', err);
        }
    });

    socket.on('completeBooking', async (data) => {
        try {
            const Booking = require('./models/Booking');
            const Provider = require('./models/Provider');
            const Message = require('./models/Message');
            const booking = await Booking.findById(data.bookingId);
            if (booking) {
                booking.status = 'completed';
                await booking.save();

                // Increment earnings
                await Provider.findByIdAndUpdate(booking.providerId, {
                    $inc: { earnings: booking.totalAmount || 0 }
                });

                // Generate professional completion & review request message
                const populatedBooking = await booking.populate('providerId customerId');
                const providerObj = await Provider.findById(populatedBooking.providerId._id).populate('userId');
                const workerName = providerObj.userId.fullName;

                const completionMsg = new Message({
                    sender: providerObj.userId._id,
                    receiver: populatedBooking.customerId._id,
                    content: `Success! Your project is now complete. 🛠️✅\n\nIt was a pleasure serving you! Please consider leaving a review to help me improve. Thank you!`,
                    messageType: 'text',
                    bookingId: booking._id
                });
                await completionMsg.save();

                // 1. Update the quote card status
                io.to(data.room).emit('quoteUpdate', {
                    bookingId: data.bookingId,
                    status: 'completed',
                    paymentStatus: booking.paymentStatus,
                    message: 'Project completed!'
                });

                // 2. Emit the chat message live
                io.to(data.room).emit('message', {
                    sender: providerObj.userId._id.toString(),
                    content: completionMsg.content,
                    messageType: 'text',
                    bookingId: booking._id,
                    createdAt: completionMsg.createdAt
                });

                // 3. Send Toast Notification
                io.to(`user-${populatedBooking.customerId._id}`).emit('notification', {
                    title: 'Mission Accomplished! ✅',
                    content: `${workerName} has completed the service. Please leave a review!`,
                    type: 'success',
                    bookingId: booking._id
                });
            }
        } catch (err) {
            console.error('Complete Booking Error:', err);
        }
    });

    socket.on('receivePayment', async (data) => {
        try {
            const Booking = require('./models/Booking');
            const Provider = require('./models/Provider');
            const booking = await Booking.findById(data.bookingId);
            
            if (booking && booking.paymentStatus === 'pending') {
                booking.paymentStatus = 'paid';
                await booking.save();

                // Increment earnings for the provider
                await Provider.findByIdAndUpdate(booking.providerId, {
                    $inc: { earnings: booking.totalAmount || 0 }
                });

                io.to(data.room).emit('quoteUpdate', {
                    bookingId: data.bookingId,
                    status: booking.status,
                    paymentStatus: 'paid',
                    message: 'Payment Received!'
                });

                // Notify Client
                const populatedBooking = await booking.populate('customerId');
                const customerUserId = populatedBooking.customerId._id;

                io.to(`user-${customerUserId}`).emit('notification', {
                    title: 'Payment Confirmed! 💰',
                    content: `The provider has confirmed receiving your payment. Thank you!`,
                    type: 'success',
                    bookingId: booking._id
                });
            }
        } catch (err) {
            console.error('Receive Payment Error:', err);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
