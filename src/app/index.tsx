import { Link } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const SWATCHES = [
  { name: "Amber", className: "bg-amber" },
  { name: "Deep amber", className: "bg-deep-amber" },
  { name: "Coral", className: "bg-coral" },
  { name: "Cream", className: "bg-cream" },
  { name: "Success", className: "bg-success" },
  { name: "Warning", className: "bg-warning" },
  { name: "Error", className: "bg-error" },
  { name: "Privacy", className: "bg-privacy" },
] as const;

export default function Index() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-6">
      <View className="gap-1">
        <Text className="text-h1 text-text-primary">Wrapup</Text>
        <Text className="text-body-md text-text-secondary">Design system preview</Text>
      </View>

      <Link href="/welcome" className="text-body-lg text-amber">
        View welcome screen →
      </Link>

      <Link href="/permissions" className="text-body-lg text-amber">
        View permissions screen →
      </Link>

      <View className="gap-2">
        <Text className="text-h2 text-text-primary">Typography</Text>
        <Text className="text-h1 text-text-primary">H1 — Screen title</Text>
        <Text className="text-h2 text-text-primary">H2 — Section title</Text>
        <Text className="text-h3 text-text-primary">H3 — Card title</Text>
        <Text className="text-body-lg text-text-primary">Body large — summary text</Text>
        <Text className="text-body-md text-text-primary">Body medium — body text</Text>
        <Text className="text-body-sm text-text-secondary">Body small — metadata, timestamps</Text>
        <Text className="text-caption text-text-secondary">Caption — labels, hints</Text>
      </View>

      <View className="gap-2">
        <Text className="text-h2 text-text-primary">Colors</Text>
        <View className="flex-row flex-wrap gap-3">
          {SWATCHES.map((swatch) => (
            <View key={swatch.name} className="w-20 gap-1">
              <View className={`h-16 w-16 rounded-xl border border-border ${swatch.className}`} />
              <Text className="text-caption text-text-secondary">{swatch.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
