# ⚡ NearFix | Local Services Marketplace

**NearFix** is a modern, premium marketplace platform designed to connect customers with trusted local service professionals. From electricians and plumbers to tutors and house cleaners, NearFix makes finding, booking, and paying for local services effortless and secure.

---

## ✨ Key Features

### 👤 For Customers

- **Smart Search**: Find experts by category (Electrician, Plumber, etc.) and location.
- **Real-time Booking**: Schedule appointments with a premium date/month/year picker.
- **Secure Chat**: Communicate directly with providers and receive instant price quotes.
- **Live Notifications**: Get notified via WhatsApp-style toasts and "Welcome Back" unread message alerts.
- **Booking Management**: Track service status from 'Pending' to 'Completed' and leave reviews.

### 🛠️ For Service Providers

- **Smart Dashboard**: Manage all your incoming bookings and performance metrics in one place.
- **Marketplace Leads**: Find open jobs in your area and send instant quotes to clients.
- **Real-time Quoting**: Send professional price offers directly through the chat.
- **Earnings Tracker**: Keep track of your completed jobs and total earnings.
- **Response Management**: Accept or reject bookings with a single click.

### 🛡️ Security & Experience

- **Role-Based Access**: Specialized views for Customers, Providers, and Admins.
- **Password Recovery**: Secure 'Forgot Password' workflow with tokenized reset links.
- **Theme Sync**: Premium dark and light mode support with smooth transitions.
- **Real-time Engine**: Built on Socket.io for instant messaging and live status updates.

---

## 🚀 Tech Stack

- **Frontend**: EJS (Embedded JavaScript), Vanilla CSS (Custom Design System), Font Awesome.
- **Backend**: Node.js, Express.js.
- **Database**: MongoDB with Mongoose.
- **Real-time**: Socket.io for live chat and notifications.
- **Security**: Passport.js (Local Strategy), Crypto for tokens, Bcrypt for hashing.
- **Storage**: Multer for profile image uploads.

---

## 🛠️ Installation & Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd NearFix
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory:

   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/nearfix
   SESSION_SECRET=your_super_secret_key
   ```

4. **Seed Initial Data (Optional)**
   Populate the database with test users and providers:

   ```bash
   npm run seed
   ```

5. **Start the Application**

   ```bash
   # For development (with nodemon)
   npm run dev

   # For production
   npm start
   ```

---

## 📸 Design Philosophy

NearFix focuses on a **Premium User Experience**. The UI is built using a custom design system that emphasizes:

- **Rich Aesthetics**: Vibrant colors, glassmorphism, and modern typography.
- **Micro-animations**: Smooth hover transitions and loading states.
- **Aesthetic Toasts**: Notification cards designed to feel premium and alive.

---

## 📄 License

This project is licensed under the **ISC License**.

---

_Made with ❤️ for the Local Services Marketplace._
