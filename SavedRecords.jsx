import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import SQLite from "react-native-sqlite-storage";

export default function SavedRecords() {
  const [records, setRecords] = useState([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  // ------------------ FORMAT DATE & TIME ------------------
  const formatDateTime = (isoString) => {
    if (!isoString) return "Unknown";

    try {
      const dateObj = new Date(isoString);

      if (isNaN(dateObj.getTime())) return isoString;

      const options = {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };

      return dateObj.toLocaleString("en-IN", options).replace(",", "");
    } catch (err) {
      return isoString;
    }
  };

  // ------------------ OPEN DATABASE ------------------
  useEffect(() => {
    const db = SQLite.openDatabase(
      { name: "AadharDB.db", location: "default" },
      () => {
        console.log("✅ Database opened successfully");
        setDbReady(true);
      },
      (error) => {
        console.error("❌ Failed to open database:", error);
        Alert.alert("Database Error", "Failed to open local database.");
      }
    );

    return () => {
      db.close();
    };
  }, []);

  // ------------------ FETCH RECORDS ------------------
  const fetchRecords = useCallback(() => {
    const db = SQLite.openDatabase({ name: "AadharDB.db", location: "default" });
    db.transaction((tx) => {
      tx.executeSql(
        `SELECT * FROM AadharData ORDER BY datetime(scanned_at) ${
          sortAsc ? "ASC" : "DESC"
        }`,
        [],
        (_, results) => {
          const rows = [];
          for (let i = 0; i < results.rows.length; i++) {
            const item = results.rows.item(i);
            rows.push({
              ...item,
              formattedDate: formatDateTime(item.scanned_at),
            });
          }
          setRecords(rows);
        },
        (error) => console.error("SQL error:", error)
      );
    });
  }, [sortAsc]);

  // ------------------ TRIGGER FETCH WHEN READY ------------------
  useEffect(() => {
    if (dbReady) fetchRecords();
  }, [dbReady, fetchRecords]);

  // ------------------ UI ------------------
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setSortAsc(!sortAsc)}>
        <Text style={styles.sortButton}>
          Sort by Date ({sortAsc ? "Oldest" : "Newest"})
        </Text>
      </TouchableOpacity>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id?.toString() ?? Math.random().toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.subText}>Aadhaar: {item.aadhaar_number}</Text>
            <Text style={styles.subText}>
              DOB: {item.dob || "N/A"} | Gender: {item.gender || "N/A"}
            </Text>
            <Text style={styles.address} numberOfLines={2} ellipsizeMode="tail">
              Address: {item.address || "N/A"}
            </Text>
            <Text style={styles.time}>
              🕒 Scanned At: {item.formattedDate}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 20 }}>
            No records found
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#F8F9FA" },
  sortButton: {
    textAlign: "center",
    padding: 10,
    backgroundColor: "#007AFF",
    color: "#fff",
    borderRadius: 6,
    marginBottom: 10,
    fontWeight: "bold",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
  },
  subText: {
    fontSize: 13,
    color: "#555",
    marginTop: 2,
  },
  address: {
    fontSize: 13,
    color: "#444",
    marginTop: 4,
  },
  time: {
    fontSize: 12,
    color: "#007AFF",
    marginTop: 6,
    fontStyle: "italic",
  },
});
