# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The application has Admin and Cashier roles. Cashiers use it for checkout and billing. Admins manage the shop, products, inventory, reports, settings, and staff accounts. The user confirmed that mobile experiences should serve both roles equally.

## Product Purpose

Devi Times supports a retail shop's billing and point-of-sale workflows, with related product, inventory, invoice, reporting, and account management.

## Capabilities and Constraints

- Preserve the existing authentication, roles, routes, APIs, database, and business workflows.
- The frontend is a React/Vite web application with an existing Electron desktop build.
- The application has offline-first workflows that save locally and sync when connected.
- The requested mobile browser and installed-PWA experiences must use the existing application and permissions.
- Do not cache authenticated API responses or private records in a service worker.

## Brand Commitments

Keep the Devi Times name and existing logo, assets, colors, and interface conventions. Do not substitute placeholder branding.

## Product Principles

- Support cashier checkout and admin operations equally in mobile navigation.
- Preserve access to every authorized existing feature across display modes.
- Keep authorization independent of browser, installed-PWA, and viewport mode.
- Preserve offline-first behavior while syncing promptly when connectivity returns.

## Accessibility & Inclusion

The requested mobile experience should follow WCAG 2.2 AA principles, including keyboard access, readable contrast, accessible navigation, and reduced-motion support.
