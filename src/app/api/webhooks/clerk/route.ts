/* eslint-disable camelcase */
import { MongoClient } from "mongodb";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const uri = process.env.MONGODB_URL as string;
let client: MongoClient | null = null;

async function connectToDatabase() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  return client.db("imaginify"); // Replace with your database name
}

// Clerk Webhook: create or delete a user in the database by Clerk ID
export async function POST(req: Request) {
  try {
    // Parse the Clerk Webhook event
    const evt = (await req.json()) as WebhookEvent;

    const { id: clerkId } = evt.data;
    if (!clerkId) {
      return NextResponse.json(
        { error: "No user ID provided" },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const db = await connectToDatabase();
    const usersCollection = db.collection("users");

    // Create or delete a user in the database based on the Clerk Webhook event
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
