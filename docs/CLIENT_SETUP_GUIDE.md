# Invexiqs WMS — Client Setup & User Guide

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Initial Setup](#2-initial-setup)
3. [Dashboard Overview](#3-dashboard-overview)
4. [Core Modules](#4-core-modules)
5. [Warehouse Operations](#5-warehouse-operations)
6. [Scanner App](#6-scanner-app)
7. [Point of Sale (POS)](#7-point-of-sale-pos)
8. [Customer Portal](#8-customer-portal)
9. [Billing & Subscription](#9-billing--subscription)
10. [Integrations](#10-integrations)
11. [Administration](#11-administration)
12. [Reports & Analytics](#12-reports--analytics)
13. [Compliance](#13-compliance)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Getting Started

### System Requirements

- **Browser:** Chrome, Edge, Safari, or Firefox (latest versions)
- **Scanner devices:** Any device with a modern browser (iOS/Android tablets, handheld scanners with browsers)
- **Internet:** Stable connection required (cloud-based system)

### Accessing Invexiqs WMS

1. Navigate to your Invexiqs WMS URL (provided by your administrator)
2. Enter your email and password
3. Click **Sign In**

First-time users will be redirected to the **Onboarding Wizard** automatically.

### User Roles

| Role | Access Level |
|------|-------------|
| **Admin** | Full access — settings, users, billing, all modules |
| **Manager** | Operations — inventory, orders, reports, shipping |
| **Staff** | Day-to-day — receiving, picking, scanning, cycle counts |

---

## 2. Initial Setup

### Onboarding Wizard

When you first log in, the onboarding wizard guides you through 5 steps:

1. **Company Info** — Enter your company name and address
2. **Warehouse Locations** — Define your storage areas (aisles, shelves, bins)
3. **Products** — Add your first products or import via CSV
4. **Suppliers** — Add your key suppliers
5. **Review** — Confirm everything looks correct

You can return to any step by clicking its name in the progress bar.

### Importing Data

Go to **Import/Export** in the sidebar to bulk-import:

- **Products** — CSV with columns: SKU, Name, Category, Cost, Price, UOM
- **Suppliers** — CSV with columns: Name, Contact, Email, Phone
- **Customers** — CSV with columns: Name, Contact, Email, Ship-To Address

Download the template CSV from the import page for the correct format.

---

## 3. Dashboard Overview

The dashboard is your home screen. It shows:

- **Key metrics** — Total products, active lots, low stock alerts, expiring items
- **Quick actions** — Receive, Ship, Scan, Cycle Count
- **Recent activity** — Latest stock movements and orders
- **Alerts** — Low stock warnings, expiring lots, pending orders

The dashboard adapts based on your preset:
- **Lite** — Simplified view for small operations
- **3PL** — Multi-client focused with customer columns
- **Full** — All modules and analytics visible

---

## 4. Core Modules

### Products

**Sidebar > Products**

- Add, edit, and archive products
- Each product has: SKU, name, manufacturer, category, cost, price, UOM
- Toggle **lot tracking** and **serial tracking** per product
- Set **low stock thresholds** and **expiry alert days**
- Storage requirements: Room Temp, Refrigerated, or Frozen

### Suppliers

**Sidebar > Suppliers**

- Manage your supplier directory
- Store contact info, account numbers, and notes
- Link suppliers to products for reorder tracking

### Customers

**Sidebar > Customers**

- Customer directory with contact info and shipping addresses
- License tracking (type, number, expiration) for regulated industries
- View order history per customer

### Lots

**Sidebar > Lots**

- View all inventory lots with quantities, locations, and expirations
- Color-coded expiration status (green/yellow/red)
- Filter by product, location, or expiration window
- Click any lot to see full movement history

### Stock Movements

**Sidebar > Movements**

- Complete audit trail of every inventory change
- Filter by product, lot, user, date range, or movement type
- Movements are immutable — they cannot be edited or deleted
- Export full audit log to CSV

---

## 5. Warehouse Operations

### Receiving

**Sidebar > Receive**

1. Select a Purchase Order or start a blind receive
2. Scan or enter the product barcode/SKU
3. Enter lot number, quantity, and expiration date
4. Assign a bin location
5. Click **Receive** — inventory is updated immediately

### Put-Away

**Sidebar > Put-Away**

- System suggests optimal bin locations based on product category and available space
- Confirm or override the suggested location
- Scan the bin barcode to verify placement

### Picking & Shipping

**Sidebar > Ship**

1. Select a sales order to pick
2. System suggests lots using **FEFO** (First Expired, First Out)
3. Scan each item to confirm picks
4. Expired lots are automatically skipped (override requires logged reason)
5. Generate packing slip (PDF) and ship

### Wave Picking

**Sidebar > Wave Picking**

- Group multiple orders into a single pick wave
- Optimized pick path by location
- Reduce warehouse trips for batch fulfillment

### Cycle Counts

**Sidebar > Cycle Counts**

1. Create a new count — select products/locations to count
2. Enter actual quantities found
3. Review variance report
4. Post adjustments — system creates adjustment movements automatically

### Transfers

**Sidebar > Transfers**

- Move inventory between warehouse locations
- Track in-transit quantities
- Full movement audit trail for each transfer

### Bin Management

**Sidebar > Bins**

- Define bin locations with min/max quantities
- View bin inventory at a glance
- Replenishment alerts when bins fall below minimum

---

## 6. Scanner App

**URL: /scan** (or tap the Scanner icon in the sidebar)

The scanner app is a separate, mobile-optimized interface for warehouse floor workers:

- **Full screen** — no desktop sidebar or header
- **Large buttons** — designed for gloved hands
- **Camera scanning** — use your device camera as a barcode scanner
- **Quick actions** — Receive, Pick, Count, Move, Lookup
- **Offline-friendly** — queues scans when connection drops

To set up a dedicated scanner device:
1. Open your Invexiqs URL + `/scan` in the device browser
2. Log in with a Staff account
3. Add to home screen for app-like experience

---

## 7. Point of Sale (POS)

**URL: /pos**

For businesses that sell directly to walk-in customers:

- Product lookup by scan or search
- Add items to cart with quantity
- Apply discounts
- Process payments via Stripe (card)
- Print receipts
- All POS sales create stock movements automatically

---

## 8. Customer Portal

**URL: /portal**

Give your customers self-service access:

- View their order history
- Track shipment status
- Download invoices and packing slips
- View product availability

### Setting Up Portal Access

1. Go to **Customers** > select a customer
2. Click **Invite to Portal**
3. Customer receives an email with login credentials
4. They access the portal at your URL + `/portal`

---

## 9. Billing & Subscription

**Sidebar > Billing** (Admin only)

### Plans

| Plan | Price | Users | Locations | Products |
|------|-------|-------|-----------|----------|
| **Starter** | $49/mo | 5 | 1 | 1,000 |
| **Professional** | $99/mo | 25 | 3 | 10,000 |
| **Enterprise** | $199/mo | Unlimited | Unlimited | Unlimited |

### Managing Your Subscription

- Click **Subscribe** on your desired plan
- Manage payment method and invoices via the **Billing Portal**
- Upgrade or downgrade at any time — changes take effect at next billing cycle

---

## 10. Integrations

### Shopify

**Sidebar > Integrations**

- Sync products, orders, and inventory with your Shopify store
- Automatic inventory updates when stock changes
- One-click install from the Shopify App Store

### QuickBooks

- Sync customers, products, and invoices
- Automatic journal entries for inventory adjustments

### Zapier

- Connect Invexiqs to 5,000+ apps
- Trigger automations on new orders, low stock alerts, and more
- Available triggers and actions documented at **Sidebar > Integrations > Zapier**

### EasyPost Shipping

- Get real-time shipping rates from multiple carriers
- Print shipping labels directly from Invexiqs
- Automatic tracking number updates

---

## 11. Administration

### User Management

**Sidebar > Admin > Users** (Admin only)

- **Add users** — enter email, name, and role
- **Edit roles** — change a user's access level
- **Reset passwords** — send a password reset link
- **Deactivate users** — disable access without deleting
- **Audit trail** — see when users were created, modified, or deactivated

### Settings

**Sidebar > Settings** (Admin only)

- **Company info** — name, address, logo
- **Feature toggles** — enable/disable modules for your organization
- **Notification preferences** — configure email alerts for low stock, expirations, etc.
- **Export data** — download a full CSV export of your data

---

## 12. Reports & Analytics

### Available Reports

**Sidebar > Reports**

| Report | Description |
|--------|-------------|
| Inventory Valuation | Current stock value by cost and retail |
| Stock on Hand | Quantities by product, lot, and location |
| Expiration Report | Items expiring within configurable windows |
| Movement History | Full audit trail with filters |
| Sales by Customer | Revenue and order volume per customer |
| Low Stock Alert | Products below reorder threshold |
| ABC Analysis | Classify products by sales velocity (A/B/C) |

All reports export to CSV with one click.

### Analytics Dashboard

**Sidebar > Analytics**

- Inventory trends over time
- Top products by movement volume
- Expiration risk breakdown
- Warehouse utilization metrics

### Product Matrix

**Sidebar > Product Matrix**

- Apprise-style 6-tab view of product performance
- Cross-reference products across dimensions

---

## 13. Compliance

For regulated industries, Invexiqs includes compliance modules:

### Controlled Substances

**Sidebar > Controlled Substances**

- DEA schedule tracking
- Reconciliation workflows with audit trails
- Destruction logging

### Recall Management

**Sidebar > Recall / Recall Monitor**

- Enter a lot number to trace all affected customers
- Export recall contact lists to CSV
- Monitor FDA recall feeds for product matches

### DSCSA / GS1

- Transaction history tracking
- GS1 barcode compliance verification
- Serialization support

---

## 14. Troubleshooting

### Common Issues

**Can't log in?**
- Check that you're using the correct URL
- Click "Forgot Password" on the login page
- Contact your admin to verify your account is active

**Barcode scanner not working?**
- Ensure your browser has camera permissions enabled
- Try manual entry as a fallback
- Clean the barcode label if it's damaged

**Data not updating?**
- Refresh the page (Ctrl+R / Cmd+R)
- Check your internet connection
- If the issue persists, check the health endpoint: `/api/health`

**Missing sidebar items?**
- Some modules are only visible to Admin or Manager roles
- Check **Settings > Feature Toggles** — some modules may be disabled
- Your preset (Lite/3PL/Full) controls which modules appear

### Getting Help

- **In-app support:** Sidebar > Support
- **Health check:** Navigate to `/api/health` to verify system status

---

*Invexiqs WMS. Intelligence in Every Movement.*
