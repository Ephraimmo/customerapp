# Flavor Finder

MASTER PROMPT – Enterprise Food Ordering & Delivery Customer Application

Project Overview

Build a world-class, enterprise-grade Food Ordering Customer Application comparable to Uber Eats, DoorDash, Bolt Food, Mr D Food, Deliveroo, Glovo, Swiggy, and Zomato.

This application is the Customer App only.

Do NOT build the Management Portal or Driver App.

The application must integrate with the existing backend APIs and Management System.

The design should be modern, premium, intuitive, responsive, and optimized for speed.

Support Android, iOS, tablets, and Progressive Web App (PWA).

Primary Objectives

Allow customers to:

Discover nearby restaurants

Browse menus

Search for food

Customize meals

Add items to cart

Apply coupons

Checkout securely

Track orders in real time

Receive notifications

Chat with support

Rate restaurants and drivers

Manage their profile

Save multiple delivery addresses

Reorder previous meals

The experience should minimize the number of taps required to place an order.

Technology Stack

Frontend

React

React Native (or Flutter if requested)

TypeScript

Tailwind CSS (Web)

Responsive UI

Offline support where practical

Backend Integration

Consume REST APIs from the Management System.

Realtime

WebSockets / Socket.IO

Firebase Cloud Messaging

Maps

Google Maps API

Authentication

JWT Authentication

Refresh Tokens

Biometric Authentication

Authentication

Implement:

Sign Up

Login

OTP Verification

Email Verification

Phone Verification

Forgot Password

Reset Password

Biometric Login

Google Sign-In

Apple Sign-In

Facebook Login (Optional)

Guest Checkout (Configurable)

Customer Onboarding

Welcome Screens

Location Permission

Notification Permission

Profile Setup

Preferred Language

Preferred Currency

Terms & Conditions

Privacy Policy Acceptance

Home Screen

Show:

Nearby Restaurants

Featured Restaurants

Popular Restaurants

Top Rated Restaurants

Recently Ordered

Recommended For You

Today's Deals

Flash Sales

Trending Meals

Categories

Quick Reorder

Featured Banners

Promotions

Loyalty Offers

Recently Viewed

Live Offers

Personalized Recommendations

Restaurant Discovery

Search by:

Restaurant Name

Food Name

Cuisine

Category

Dietary Preference

Price

Distance

Rating

Delivery Time

Open Now

Sorting

Filter by:

Distance

Rating

Price

Delivery Fee

Preparation Time

Offers

Cuisine

Diet

Restaurant Page

Display:

Restaurant Banner

Logo

Rating

Reviews

Opening Hours

Delivery Time

Distance

Delivery Fee

Minimum Order

Menu Categories

Popular Items

Featured Meals

Deals

Restaurant Information

Reviews

Photos

Contact Information

Menu

Display:

Categories

Subcategories

Meals

Combos

Variants

Sizes

Add-ons

Extras

Ingredients

Nutrition

Allergens

Preparation Time

Availability

Images

Stock Status

Search Menu

Favorite Meals

Meal Customization

Allow customers to:

Choose Size

Choose Variants

Select Extras

Remove Ingredients

Special Instructions

Quantity

Gift Order

Schedule Order

Save Favorite Configuration

Shopping Cart

Support:

Multiple Items

Multiple Restaurants (configurable)

Quantity Updates

Special Notes

Coupons

Promo Codes

Gift Cards

Tips

Delivery Instructions

Price Breakdown

Taxes

Delivery Fee

Estimated Arrival

Save Cart

Persistent Cart

Checkout

Delivery Address

Pickup Option

Delivery Instructions

Schedule Delivery

Payment Method

Coupon Validation

Order Summary

Estimated Delivery Time

Review Order

Place Order

Order Confirmation

Payment Methods

Credit Card

Debit Card

Apple Pay

Google Pay

Cash on Delivery

Wallet

PayFast

Yoco

Ozow

Stripe

Saved Cards

Payment Retry

Refund Status

Order Tracking

Realtime tracking

Order Timeline

Restaurant Accepted

Preparing

Ready

Driver Assigned

Driver En Route

Driver Arrived

Delivered

Cancelled

Estimated Arrival Time

Live Driver Location

Map Tracking

Driver Details

Restaurant Contact

Support Button

Notifications

Push Notifications

SMS

Email

Order Updates

Promotions

Loyalty Rewards

Coupons

Referral Rewards

Announcements

System Messages

Notification Center

Customer Profile

Personal Information

Profile Picture

Phone Numbers

Email

Saved Addresses

Favorite Restaurants

Favorite Meals

Payment Methods

Wallet

Loyalty Points

Coupons

Order History

Notification Preferences

Language

Theme

Privacy Settings

Delete Account

Order History

Current Orders

Past Orders

Invoices

Receipts

Repeat Order

Download Invoice

Order Status

Refund Status

Rate Order

Support Request

Reviews & Ratings

Rate Restaurant

Rate Driver

Rate Food

Write Review

Upload Photos

Report Review

Edit Review

Delete Review

Favorites

Favorite Restaurants

Favorite Meals

Favorite Addresses

Saved Searches

Quick Reorder

Loyalty Program

Reward Points

Tier Levels

Achievements

Coupons

Birthday Rewards

Referral Rewards

Wallet Cashback

Promotional Credits

Referral System

Referral Code

Invite Friends

Referral Rewards

Track Invitations

Bonus Credits

Customer Wallet

Wallet Balance

Transactions

Top-Up

Cashback

Promotional Credits

Refund Credits

Transaction History

Customer Support

Live Chat

AI Assistant

Help Center

FAQs

Raise Ticket

Call Restaurant

Call Driver

Call Support

Complaint Tracking

Refund Requests

Issue Escalation

Maps & Location

Current Location

GPS Tracking

Saved Addresses

Home

Work

Custom Addresses

Address Validation

Pin Location

Delivery Zone Validation

Route Preview

Security

JWT Authentication

Biometric Login

Device Management

Session Management

Password Encryption

OTP Verification

Rate Limiting

Fraud Detection Hooks

Secure Payment Flow

Offline Behaviour

Cache restaurant data

Cache menus

Cache recent orders

Queue actions where appropriate

Graceful network recovery

Accessibility

WCAG Compliance

Large Fonts

High Contrast

Screen Reader Support

Keyboard Navigation (Web)

VoiceOver / TalkBack Compatibility

Performance

Fast Startup

Lazy Loading

Image Optimization

API Pagination

Caching

Realtime Updates

Background Sync

Optimized Battery Usage

API Integration

Integrate with existing backend endpoints for:

Authentication

Restaurants

Menus

Orders

Payments

Promotions

Coupons

Notifications

Customers

Wallet

Reviews

Support

Loyalty

Reports (customer-facing)

Maps

UI Design Requirements

Premium Design

Clean Layout

Modern Animations

Responsive

Dark Mode

Light Mode

Bottom Navigation

Floating Action Buttons

Skeleton Loaders

Empty States

Error Handling

Pull to Refresh

Infinite Scrolling

Beautiful Cards

Modern Typography

Accessibility First

AI Development Instructions

Build the application in this order:

Authentication

Onboarding

Home Screen

Restaurant Discovery

Restaurant Details

Menu

Meal Customization

Shopping Cart

Checkout

Payments

Order Tracking

Notifications

Customer Profile

Order History

Reviews & Ratings

Favorites

Loyalty & Referrals

Wallet

Customer Support

Settings

Offline Support

Performance Optimization

Accessibility

Testing

Production Deployment

Generate complete production-ready code with a polished UI, scalable architecture, robust error handling, and seamless integration with the Management System backend. Follow enterprise coding standards, implement reusable components, maintain a consistent design system, and ensure the application is optimized for performance, security, maintainability, and future expansion.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c6bf95aa-2254-49f4-b141-a6fd624617f3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
