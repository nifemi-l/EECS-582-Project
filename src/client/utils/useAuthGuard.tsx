import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getToken } from "../utils/authStorage";

export function useAuthGuard() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await getToken();
        if (!token) {
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
          router.replace("/login");
          return;
        }

        setIsAuthenticated(true);
        setIsCheckingAuth(false);
      } catch {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        router.replace("/login");
      }
    }

    checkAuth();
  }, [router]);

  return { isCheckingAuth, isAuthenticated };
}

export function AuthLoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B6DB5" />
      <Text style={styles.text}>Checking your session...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F2F5",
    gap: 14,
  },
  text: {
    fontSize: 16,
    color: "#5B6B7F",
    fontWeight: "600",
  },
});
