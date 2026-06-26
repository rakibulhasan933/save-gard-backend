import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return encoder.encode(secret);
}

export type ChildTokenPayload = {
  id: string;
  role: "child";
};

// Child WebSocket auth tokens are HS256 JWTs signed with JWT_SECRET.
// The signaling server's verifyChildToken(token) contract needs at least { id: childId }.
export async function issueChildToken(childId: string) {
  return new SignJWT({ id: childId, role: "child" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(jwtSecret());
}

export async function verifyChildToken(token: string): Promise<ChildTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (typeof payload.id !== "string" || payload.role !== "child") {
      return null;
    }
    return { id: payload.id, role: "child" };
  } catch {
    return null;
  }
}
