import mongoose, { Schema } from "mongoose";

// Generic flexible schema — accepts any fields, uses _id as string-friendly id
const flexibleSchema = new Schema({}, { strict: false, timestamps: false });

// Auto-map _id → id in JSON output
flexibleSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// Get or create a Mongoose model for any collection name
export function getModel(collectionName: string) {
  return (
    mongoose.models[collectionName] ||
    mongoose.model(collectionName, flexibleSchema, collectionName)
  );
}
