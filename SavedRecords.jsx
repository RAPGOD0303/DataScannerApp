import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import SQLite from "react-native-sqlite-storage";
import RNFS from "react-native-fs";
import Share from "react-native-share";

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
      () => setDbReady(true),
      (error) => {
        console.error("❌ Failed to open database:", error);
        Alert.alert("Database Error", "Failed to open local database.");
      }
    );
    return () => db.close();
  }, []);

  // ------------------ FETCH RECORDS ------------------
  const fetchRecords = useCallback(() => {
    const db = SQLite.openDatabase({ name: "AadharDB.db", location: "default" });
    db.transaction((tx) => {
      tx.executeSql(
        `SELECT * FROM AadharData ORDER BY datetime(scanned_at) ${sortAsc ? "ASC" : "DESC"}`,
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

  useEffect(() => {
    if (dbReady) fetchRecords();
  }, [dbReady, fetchRecords]);

  // ------------------ EXPORT CSV ------------------
  const exportToCSV = async () => {
    if (records.length === 0) {
      Alert.alert("No Data", "There are no records to export.");
      return;
    }

    // CSV Headers
    const headers = ["ID", "Name", "Aadhaar Number", "DOB", "Gender", "Address", "Scanned At"];

    // CSV Rows
    const csvRows = records.map((r) =>
      [
        r.id,
        `"${r.name}"`,
        r.aadhaar_number,
        r.dob,
        r.gender,
        `"${r.address}"`,
        `"${r.formattedDate}"`,
      ].join(",")
    );

    const csvString = [headers.join(","), ...csvRows].join("\n");

    // File path
    const filePath =
      Platform.OS === "android"
        ? `${RNFS.DownloadDirectoryPath}/AadharRecords_${Date.now()}.csv`
        : `${RNFS.DocumentDirectoryPath}/AadharRecords_${Date.now()}.csv`;

    try {
      await RNFS.writeFile(filePath, csvString, "utf8");
      Alert.alert("✅ Success", `CSV saved to:\n${filePath}`);

      // Share CSV
      await Share.open({
        title: "Share Aadhar Records CSV",
        url: Platform.OS === "android" ? `file://${filePath}` : filePath,
        type: "text/csv",
      });
    } catch (error) {
      console.error("CSV Export Error:", error);
      Alert.alert("Error", "Failed to export CSV file.");
    }
  };

  // ------------------ UI ------------------
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setSortAsc(!sortAsc)}>
        <Text style={styles.sortButton}>
          Sort by Date ({sortAsc ? "Oldest" : "Newest"})
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={exportToCSV}>
        <Text style={styles.downloadButton}>⬇️ Download CSV</Text>
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
            <Text style={styles.time}>🕒 Scanned At: {item.formattedDate}</Text>
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
  downloadButton: {
    textAlign: "center",
    padding: 10,
    backgroundColor: "#34C759",
    color: "#fff",
    borderRadius: 6,
    marginBottom: 15,
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
  title: { fontSize: 15, fontWeight: "bold", color: "#333" },
  subText: { fontSize: 13, color: "#555", marginTop: 2 },
  address: { fontSize: 13, color: "#444", marginTop: 4 },
  time: { fontSize: 12, color: "#007AFF", marginTop: 6, fontStyle: "italic" },
});
