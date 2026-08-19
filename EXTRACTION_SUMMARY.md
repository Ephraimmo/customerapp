# Swift Extraction / Hearth — Food Delivery Customer App

**Repository**: [https://github.com/Ephraimmo/swift-extraction.git](https://github.com/Ephraimmo/swift-extraction.git)  
**Status**: Successfully downloaded, extracted, dependencies installed, and build verified.

---

## 1. Project Overview

**Hearth** (also referenced as _Flavor Finder_) is an enterprise-grade food ordering and delivery customer web application built with **TanStack Start**, **TanStack Router**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **Radix UI**, and **Firebase Realtime Database**.

It provides a modern customer-facing delivery experience comparable to Uber Eats, Deliveroo, DoorDash, and Bolt Food, featuring live restaurant discovery, real-time Firebase menu sync, customizable dishes, persistent shopping cart, multi-step checkout, real-time order tracking, user authentication, loyalty program, and customer account management.

---

## 2. Directory Structure

```plaintext
swift-extraction/
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── assets/                      # Restaurant and dish hero imagery
│   │   ├── dish-bowl.jpg
│   │   ├── dish-burger.jpg
│   │   ├── dish-pizza.jpg
│   │   ├── rest-grill.jpg
│   │   ├── rest-hearth.jpg
│   │   ├── rest-shoyu.jpg
│   │   ├── rest-sushi.jpg
│   │   └── rest-taqueria.jpg
│   ├── components/
│   │   ├── app/                     # Domain application components
│   │   │   ├── bottom-nav.tsx       # Persistent bottom navigation bar
│   │   │   ├── cart-bar.tsx         # Floating quick-cart sticky bar
│   │   │   ├── dish-sheet.tsx       # Dish customization modal drawer
│   │   │   ├── live-image.tsx       # Resilient image loader with fallback
│   │   │   ├── restaurant-card.tsx  # Restaurant listing preview card
│   │   │   └── top-nav.tsx          # Desktop navigation header
│   │   └── ui/                      # 30+ Radix UI & Shadcn primitive components
│   ├── hooks/
│   │   └── use-mobile.tsx           # Responsive viewport hook
│   ├── lib/
│   │   ├── auth.tsx                 # Authentication context & demo accounts
│   │   ├── cart.tsx                 # Shopping cart state, stages & calculations
│   │   ├── data.ts                  # Shared domain types, live registry & helpers
│   │   ├── error-capture.ts         # SSR error handling & diagnostics
│   │   ├── error-page.ts            # Error page renderer
│   │   ├── firebase.ts              # Firebase Client SDK & RTDB initialization
│   │   ├── firebase-adapters.ts     # Reactive hooks for Firebase data streams
│   │   ├── firebase-live.ts         # Real-time subscriptions & sync layer
│   │   ├── firebase-schema.ts       # Runtime schema inference & validation
│   │   ├── lovable-error-reporting.ts # Error reporting integrations
│   │   └── utils.ts                 # Classname utility (`cn`)
│   ├── routes/                      # TanStack Router File-Based Routing
│   │   ├── __root.tsx               # Root layout, providers & toasts
│   │   ├── index.tsx                # Home / Discovery screen
│   │   ├── search.tsx               # Search, filters & cuisine categories
│   │   ├── restaurant.$slug.tsx     # Restaurant details & full menu page
│   │   ├── cart.tsx                 # Full cart view, coupon entry & tip selection
│   │   ├── checkout.tsx             # Address, payment method & order review
│   │   ├── orders.index.tsx         # Order history & past receipts
│   │   ├── orders.$orderId.tsx      # Real-time order tracking & status timeline
│   │   ├── account.tsx              # User profile, loyalty points, wallet & favorites
│   │   └── login.tsx                # Authentication screen
│   ├── routeTree.gen.ts             # Auto-generated TanStack route tree
│   ├── router.tsx                   # TanStack Router & Query client factory
│   ├── server.ts                    # SSR server entry point
│   ├── start.ts                     # TanStack Start middleware & CSRF protection
│   └── styles.css                   # Global styles & Tailwind design tokens
├── components.json                  # Shadcn UI configuration
├── eslint.config.js                 # ESLint flat configuration
├── package.json                     # Project manifest & npm scripts
├── tsconfig.json                    # TypeScript compiler configuration
└── vite.config.ts                   # Vite & TanStack Start build configuration
```

---

## 3. Technology Stack

| Layer                 | Technology                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| **Framework**         | [TanStack Start](https://tanstack.com/start) with Nitro SSR engine        |
| **Routing**           | [TanStack Router](https://tanstack.com/router) (File-based routing)       |
| **Data Fetching**     | [TanStack Query](https://tanstack.com/query) & Firebase RTDB              |
| **UI Library**        | React 19, Radix UI primitives, Lucide React icons                         |
| **Styling**           | Tailwind CSS v4, class-variance-authority, clsx, tailwind-merge           |
| **Realtime Database** | Firebase Realtime Database (`e-comm-bd997`)                               |
| **State Management**  | React Context (`CartProvider`, `AuthProvider`) + LocalStorage persistence |
| **Notifications**     | Sonner toast notifications                                                |
| **Build Tool**        | Vite 8, Nitro for Cloudflare / Serverless deployments                     |

---

## 4. Key Application Features

1. **Discovery & Home Screen (`/`)**:
   - Location header with delivery address.
   - Quick category pills (Burgers, Pizza, Ramen, Sushi, Tacos, BBQ).
   - Live promotions and discount banners.
   - Nearby, top-rated, and featured restaurant feeds.
   - Quick reorder for recent orders.

2. **Search & Filter (`/search`)**:
   - Query search across restaurant names, dishes, cuisines, and diets.
   - Sort by Recommended, Top Rated, Fastest ETA, Lowest Fee, and Distance.
   - Dietary filter toggles (Vegetarian, Vegan, Gluten-Free).

3. **Restaurant & Menu View (`/restaurant/$slug`)**:
   - Dynamic restaurant header with cover photo, badges, rating, delivery fee, and opening hours.
   - Categorized menu listings with high-res photos, preparation times, calorie counts, and prices.
   - Interactive dish customization drawer (`DishSheet`) supporting size selection, extras, removal of ingredients, special cooking instructions, and quantity adjustment.

4. **Cart & Checkout (`/cart`, `/checkout`)**:
   - Multi-item management with live subtotal, delivery fee calculation, tip selection (10%, 15%, 20%, custom), and promo coupon code validation.
   - Address selector (Home, Work, Custom).
   - Multiple payment options (Saved Cards, Apple Pay, Hearth Wallet, Cash on Delivery).
   - Automatic order generation with random IDs and instant tracking redirection.

5. **Live Order Tracking (`/orders/$orderId`)**:
   - Visual 5-stage progress timeline: _Order Placed → Accepted → Kitchen Preparing → Driver En Route → Delivered_.
   - Driver contact and support buttons.
   - Live ETA countdown and receipt item breakdown.

6. **Account, Loyalty & Wallet (`/account`)**:
   - Customer profile with initials badge.
   - Wallet balance and loyalty points tracker (1 point per £1 spent).
   - Saved delivery addresses management.
   - Favorited restaurants and order history shortcuts.

7. **Authentication (`/login`)**:
   - Email/password authentication.
   - Pre-configured demo accounts for fast testing (Alex Mercer, Sophia Chen, Marcus Vance).

---

## 5. Development & Running Instructions

### Prerequisites

- Node.js 20+ (Node 22+ recommended)
- npm or bun

### Running Locally

```bash
# Clone or navigate to the directory
cd /home/user/swift-extraction

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

### Building for Production

```bash
npm run build
```

### Previewing the Production Build

```bash
npm run preview
```
