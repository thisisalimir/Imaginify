/* eslint-disable camelcase */
import { MongoClient } from "mongodb";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Webhook } from "svix"; // Ensure svix is installed
import { headers } from "next/headers";

const uri = process.env.MONGODB_URL as string;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET as string;

let client: MongoClient | null = null;
console.log("test Me0");

async function connectToDatabase() {
  console.log("test Me1");
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  return client.db("imaginify"); // Replace with your database name
}

// Clerk Webhook: create or delete a user in the database by Clerk ID
export async function POST(req: Request) {
  console.log("test Me2");

  try {
    // Verify webhook secret
    const headerPayload = headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.error("Error occurred -- no svix headers");
      return new Response("Error occurred -- no svix headers", { status: 400 });
    }

    // Get and log the payload
    const payload = await req.json();
    const body = JSON.stringify(payload);
    console.log("Webhook Payload:", body);

    // Create Svix instance and verify payload
    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: WebhookEvent;
    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Error verifying webhook:", err);
      return new Response("Error occurred during verification", {
        status: 400,
      });
    }

    // Connect to MongoDB
    const db = await connectToDatabase();
    const usersCollection = db.collection("users");

    // Handle the webhook event
    const { id: clerkId } = evt.data;
    if (!clerkId) {
      console.error("No user ID provided");
      return NextResponse.json(
        { error: "No user ID provided" },
        { status: 400 }
      );
    }

    let user = null;
    switch (evt.type) {
      case "user.created": {
        const {
          email_addresses = [],
          image_url = "",
          first_name = "",
          last_name = "",
          username = "",
        } = evt.data;
        const email = email_addresses?.[0]?.email_address ?? "";

        if (!email) {
          console.error("No email provided");
          return NextResponse.json(
            { error: "No email provided" },
            { status: 400 }
          );
        }

        user = await usersCollection.updateOne(
          { clerkId },
          {
            $set: {
              clerkId,
              email,
              username,
              firstName: first_name ?? "",
              lastName: last_name ?? "",
              photo: image_url ?? "",
            },
          },
          { upsert: true }
        );
        break;
      }
      case "user.deleted": {
        await usersCollection.deleteOne({ clerkId });
        break;
      }
      default:
        console.warn(`Unhandled event type: ${evt.type}`);
        break;
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error handling webhook:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
