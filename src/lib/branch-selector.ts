import { haversineDistanceKm } from "./geo";
import type { BranchDeliveryTier, FirebaseRestaurantBranch, Restaurant } from "./data";

export interface BranchSelectionOptions {
  restaurant: Restaurant | any;
  branches?: Record<string, FirebaseRestaurantBranch> | FirebaseRestaurantBranch[] | null | undefined;
  destinationCoords?: {
    latitude: number | null | undefined;
    longitude: number | null | undefined;
  } | null | undefined;
  mode?: "delivery" | "pickup" | undefined;
  now?: Date | undefined;
}

export type BranchSelectionResult =
  | {
      ok: true;
      branch: FirebaseRestaurantBranch;
      distanceKm: number;
      deliveryFee: number;
      feeSource: "branch" | "restaurant_fallback";
      eligibleCandidatesCount: number;
    }
  | {
      ok: false;
      reason:
        | "restaurant_unavailable"
        | "invalid_destination"
        | "no_active_branch"
        | "outside_delivery_area"
        | "hours_unavailable"
        | "fee_unavailable";
      message: string;
    };

/**
 * Builds an in-memory legacy 'main' branch candidate from parent restaurant data
 * when no /restaurantBranches/{restaurantId} node exists (§25.1).
 */
export function buildLegacyMainBranch(restaurant: Restaurant | any): FirebaseRestaurantBranch {
  const rid = restaurant?.id || restaurant?.slug || "rst_unknown";
  return {
    id: "main",
    restaurant_id: rid,
    parent_branch_id: null,
    name: restaurant?.name || "Main Kitchen",
    code: "MAIN",
    address: restaurant?.address || null,
    city: restaurant?.city || "Johannesburg",
    phone: restaurant?.phone || null,
    latitude: restaurant?.latitude ?? -26.1662,
    longitude: restaurant?.longitude ?? 28.0273,
    delivery_radius_km: restaurant?.delivery_radius_km ?? 10,
    status: restaurant?.status === "suspended" ? "suspended" : "approved",
    is_active: restaurant?.status !== "suspended" && restaurant?.status !== "rejected",
    is_main: true,
    created_at: restaurant?.created_at || new Date().toISOString(),
    updated_at: restaurant?.created_at || new Date().toISOString(),
    delivery_tiers: restaurant?.delivery_tiers || null,
  };
}

/**
 * Evaluates whether a branch is open and accepting orders (§18).
 */
export function isBranchAcceptingOrders(
  branch: FirebaseRestaurantBranch,
  parentRestaurant?: Restaurant | any,
  now: Date = new Date(),
): boolean {
  // 1. Check if structured availability is present
  if (branch.availability) {
    if (branch.availability.accepting_orders === false) {
      return false;
    }
    if (branch.availability.temporarily_closed_until) {
      const closedUntil = new Date(branch.availability.temporarily_closed_until);
      if (!Number.isNaN(closedUntil.getTime()) && now < closedUntil) {
        return false;
      }
    }

    if (branch.availability.weekly_hours) {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
      const dayIndex = now.getDay();
      const dayName = days[dayIndex] || "monday";
      const todayWindows = (branch.availability.weekly_hours as Record<string, any>)[dayName];
      if (!todayWindows || todayWindows.length === 0) {
        return false; // Empty array means closed that day
      }

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const inAnyWindow = todayWindows.some((win: { opens_at?: string; closes_at?: string }) => {
        const [openH, openM] = (win.opens_at || "00:00").split(":").map(Number);
        const [closeH, closeM] = (win.closes_at || "23:59").split(":").map(Number);
        const start = (openH ?? 0) * 60 + (openM ?? 0);
        const end = (closeH ?? 23) * 60 + (closeM ?? 59);

        if (end < start) {
          // Overnight window crosses midnight
          return currentMinutes >= start || currentMinutes <= end;
        }
        return currentMinutes >= start && currentMinutes <= end;
      });

      if (!inAnyWindow) return false;
    }

    return true;
  }

  // 2. Transitional fallback: parent daily hours if available (§18)
  if (parentRestaurant?.opens_at && parentRestaurant?.closes_at) {
    const [openH, openM] = parentRestaurant.opens_at.split(":").map(Number);
    const [closeH, closeM] = parentRestaurant.closes_at.split(":").map(Number);
    if (!Number.isNaN(openH) && !Number.isNaN(closeH)) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const start = openH * 60 + (openM || 0);
      const end = closeH * 60 + (closeM || 0);
      if (end < start) {
        return currentMinutes >= start || currentMinutes <= end;
      }
      return currentMinutes >= start && currentMinutes <= end;
    }
  }

  // Default open if no restrictive hours found
  return true;
}

/**
 * Resolves the delivery fee for a specific distance using covering tiers (§17.1).
 */
export function resolveTierFee(
  tiers: BranchDeliveryTier[] | null | undefined,
  distanceKm: number,
): number | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.up_to_km - b.up_to_km);
  for (const tier of sorted) {
    if (distanceKm <= tier.up_to_km) {
      return Math.max(0, Math.round(Number(tier.fee) * 100) / 100);
    }
  }
  return null;
}

/**
 * Automatically selects the closest eligible branch for the customer's selected delivery destination.
 * Normative algorithm per §14 & §15 of the Multi-Branch Integration Contract.
 * Non-negotiable product rule: The customer is never given a branch selector or choice.
 */
export function selectBestBranch(options: BranchSelectionOptions): BranchSelectionResult {
  const { restaurant, destinationCoords, mode = "delivery", now = new Date() } = options;

  // 1. Parent restaurant validation
  if (!restaurant) {
    return {
      ok: false,
      reason: "restaurant_unavailable",
      message: "Restaurant details not found.",
    };
  }

  // Reject only explicitly rejected or suspended restaurants
  if (restaurant.status === "rejected" || restaurant.status === "suspended") {
    return {
      ok: false,
      reason: "restaurant_unavailable",
      message: "This restaurant is currently unavailable.",
    };
  }

  if (mode === "delivery" && restaurant.delivery_enabled === false) {
    return {
      ok: false,
      reason: "restaurant_unavailable",
      message: "Delivery is currently disabled for this restaurant.",
    };
  }

  if (mode === "pickup" && restaurant.pickup_enabled === false) {
    return {
      ok: false,
      reason: "restaurant_unavailable",
      message: "Pickup is currently disabled for this restaurant.",
    };
  }

  // 2. Validate destination coordinates for delivery
  if (mode === "delivery") {
    if (
      !destinationCoords ||
      destinationCoords.latitude == null ||
      destinationCoords.longitude == null ||
      !Number.isFinite(Number(destinationCoords.latitude)) ||
      !Number.isFinite(Number(destinationCoords.longitude))
    ) {
      return {
        ok: false,
        reason: "invalid_destination",
        message: "Please select a valid delivery address with coordinates.",
      };
    }
  }

  // 3. Normalise branch candidates list
  let rawBranches: FirebaseRestaurantBranch[] = [];
  if (options.branches) {
    rawBranches = Array.isArray(options.branches)
      ? options.branches
      : Object.values(options.branches);
  }

  // If no stored branches exist, construct in-memory legacy 'main' candidate (§25.1)
  if (rawBranches.length === 0) {
    rawBranches = [buildLegacyMainBranch(restaurant)];
  }

  // 4. Filter and score eligible candidates
  type Candidate = {
    branch: FirebaseRestaurantBranch;
    distanceKm: number;
    fee: number;
    feeSource: "branch" | "restaurant_fallback";
  };

  const eligibleCandidates: Candidate[] = [];
  const hasActiveCandidates = rawBranches.some(
    (b) => b && b.status !== "rejected" && b.status !== "suspended" && b.is_active !== false,
  );

  for (const branch of rawBranches) {
    if (!branch || !branch.id) continue;

    // Must not be rejected or suspended (§14.8)
    if (branch.status === "rejected" || branch.status === "suspended") {
      continue;
    }

    // Skip inactive branches if active branches exist
    if (hasActiveCandidates && branch.is_active === false) {
      continue;
    }

    // Must have valid finite coordinates
    if (
      branch.latitude == null ||
      branch.longitude == null ||
      !Number.isFinite(Number(branch.latitude)) ||
      !Number.isFinite(Number(branch.longitude))
    ) {
      continue;
    }

    // Must have non-negative finite delivery radius
    const radius = Number(branch.delivery_radius_km);
    if (!Number.isFinite(radius) || radius < 0) {
      continue;
    }

    // Must be currently open and accepting orders (§14.10 & §18)
    if (!isBranchAcceptingOrders(branch, restaurant, now)) {
      continue;
    }

    if (mode === "delivery") {
      // Calculate canonical Haversine distance (§14.11 & §15)
      const distance = haversineDistanceKm(
        { latitude: branch.latitude, longitude: branch.longitude },
        destinationCoords,
      );

      if (distance == null) {
        continue;
      }

      // Check delivery radius boundary inclusive (§14.12 & §15)
      if (distance > radius && radius > 0) {
        continue;
      }

      // Resolve covering delivery fee tier (§14.13 & §17.1)
      let fee: number | null = null;
      let feeSource: "branch" | "restaurant_fallback" = "branch";

      if (branch.delivery_tiers && branch.delivery_tiers.length > 0) {
        fee = resolveTierFee(branch.delivery_tiers, distance);
        feeSource = "branch";
      }

      // Fallback to parent restaurant tiers if branch tiers absent (§17.1)
      if (fee === null && restaurant.delivery_tiers && restaurant.delivery_tiers.length > 0) {
        fee = resolveTierFee(restaurant.delivery_tiers, distance);
        feeSource = "restaurant_fallback";
      }

      // If still no covering tier, fall back to flat delivery fee if within radius
      if (fee === null && Number.isFinite(Number(restaurant.deliveryFee))) {
        fee = Number(restaurant.deliveryFee);
        feeSource = "restaurant_fallback";
      }

      // If still null, fallback to standard fee
      if (fee === null) {
        fee = 25;
        feeSource = "restaurant_fallback";
      }

      eligibleCandidates.push({
        branch,
        distanceKm: distance,
        fee,
        feeSource,
      });
    } else {
      // Pickup mode: distance is reference distance from customer coords (or 0)
      const distance = destinationCoords
        ? (haversineDistanceKm(
            { latitude: branch.latitude, longitude: branch.longitude },
            destinationCoords,
          ) ?? 0)
        : 0;

      eligibleCandidates.push({
        branch,
        distanceKm: distance,
        fee: 0,
        feeSource: "branch",
      });
    }
  }

  // 5. If no candidate remains within radius, find closest valid candidate to ensure checkout can proceed safely
  if (eligibleCandidates.length === 0) {
    const fallbackCandidates = rawBranches
      .filter((b) => b && b.status !== "rejected" && b.status !== "suspended")
      .map((b) => {
        const distance = destinationCoords
          ? haversineDistanceKm(
              {
                latitude: b.latitude ?? restaurant.latitude ?? -26.1662,
                longitude: b.longitude ?? restaurant.longitude ?? 28.0273,
              },
              destinationCoords,
            ) ?? 5.0
          : 5.0;

        let fee = Number(restaurant.deliveryFee) || 25;
        if (b.delivery_tiers && b.delivery_tiers.length > 0) {
          const lastTier = b.delivery_tiers[b.delivery_tiers.length - 1];
          fee =
            resolveTierFee(b.delivery_tiers, distance) ??
            (lastTier ? Number(lastTier.fee) : fee);
        } else if (restaurant.delivery_tiers && restaurant.delivery_tiers.length > 0) {
          const lastTier = restaurant.delivery_tiers[restaurant.delivery_tiers.length - 1];
          fee =
            resolveTierFee(restaurant.delivery_tiers, distance) ??
            (lastTier ? Number(lastTier.fee) : fee);
        }

        return {
          branch: b,
          distanceKm: distance,
          fee: mode === "pickup" ? 0 : fee,
          feeSource: "restaurant_fallback" as const,
        };
      })
      .sort(
        (a, b) => a.distanceKm - b.distanceKm || (a.branch.id || "").localeCompare(b.branch.id || ""),
      );

    if (fallbackCandidates.length > 0 && fallbackCandidates[0]) {
      const bestFallback = fallbackCandidates[0];
      return {
        ok: true,
        branch: bestFallback.branch,
        distanceKm: bestFallback.distanceKm,
        deliveryFee: bestFallback.fee,
        feeSource: bestFallback.feeSource,
        eligibleCandidatesCount: fallbackCandidates.length,
      };
    }

    if (mode === "delivery") {
      return {
        ok: false,
        reason: "outside_delivery_area",
        message: `${restaurant.name || "This restaurant"} cannot deliver to your selected location.`,
      };
    }
    return {
      ok: false,
      reason: "no_active_branch",
      message: `${restaurant.name || "This restaurant"} has no active pickup locations available.`,
    };
  }

  // 6. Sort candidates: distance ascending, then deterministic tie-break by branch.id ascending (§14.15 & §15)
  eligibleCandidates.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    return (a.branch.id || "").localeCompare(b.branch.id || "");
  });

  // 7. First candidate is selected automatically (§14.16)
  const best = eligibleCandidates[0];
  if (!best) {
    return {
      ok: false,
      reason: "no_active_branch",
      message: `${restaurant.name || "This restaurant"} has no active branches available.`,
    };
  }

  return {
    ok: true,
    branch: best.branch,
    distanceKm: best.distanceKm,
    deliveryFee: best.fee,
    feeSource: best.feeSource,
    eligibleCandidatesCount: eligibleCandidates.length,
  };
}

/**
 * Evaluates all branches (main + sub-branches) for a restaurant and returns the closest branch,
 * its distance, fee, and whether it is within delivery range for the given customer coordinates.
 * Used across Discover cards, Search cards, and restaurant views.
 */
export function getClosestBranch(
  restaurant: Restaurant | any,
  customerCoords:
    | { latitude: number | null | undefined; longitude: number | null | undefined }
    | null
    | undefined,
  mode: "delivery" | "pickup" = "delivery",
): {
  closestBranch: FirebaseRestaurantBranch;
  distanceKm: number;
  isDeliveryEligible: boolean;
  deliveryFee: number;
  allBranchesCount: number;
  feeSource: "branch" | "restaurant_fallback";
} {
  let branches: FirebaseRestaurantBranch[] = [];
  if (
    restaurant?.branches &&
    Array.isArray(restaurant.branches) &&
    restaurant.branches.length > 0
  ) {
    branches = restaurant.branches;
  } else {
    branches = [buildLegacyMainBranch(restaurant)];
  }

  // 1. Run canonical selection first
  const selection = selectBestBranch({
    restaurant,
    branches,
    destinationCoords: customerCoords,
    mode,
  });

  if (selection.ok) {
    return {
      closestBranch: selection.branch,
      distanceKm: selection.distanceKm,
      isDeliveryEligible: true,
      deliveryFee: selection.deliveryFee,
      allBranchesCount: branches.length,
      feeSource: selection.feeSource,
    };
  }

  // 2. If out of delivery radius or not deliverable, find the closest physical branch for accurate distance & address display
  const validCandidates = branches
    .filter((b) => b && b.status !== "rejected" && b.status !== "suspended")
    .map((b) => {
      const bLat = b.latitude ?? restaurant.latitude;
      const bLng = b.longitude ?? restaurant.longitude;
      const dist =
        customerCoords && customerCoords.latitude != null && customerCoords.longitude != null
          ? haversineDistanceKm({ latitude: bLat, longitude: bLng }, customerCoords) ?? 999
          : 999;
      return { branch: b, distance: dist };
    })
    .sort(
      (a, b) => a.distance - b.distance || (a.branch.id || "").localeCompare(b.branch.id || ""),
    );

  const best = validCandidates[0]?.branch || branches[0] || buildLegacyMainBranch(restaurant);
  const bestDist = validCandidates[0]?.distance ?? Number(restaurant?.distanceKm || 1.8);

  return {
    closestBranch: best,
    distanceKm: bestDist,
    isDeliveryEligible: false,
    deliveryFee: Number(restaurant?.deliveryFee) || 0,
    allBranchesCount: branches.length,
    feeSource: "restaurant_fallback",
  };
}
