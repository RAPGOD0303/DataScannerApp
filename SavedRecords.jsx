import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import SQLite from "react-native-sqlite-storage";

export default function SavedRecords() {
  const [records, setRecords] = useState([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [dbReady, setDbReady] = useState(false);

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
        `SELECT * FROM AadharData ORDER BY datetime(scanned_at) ${sortAsc ? "ASC" : "DESC"}`,
        [],
        (_, results) => {
          const rows = [];
          for (let i = 0; i < results.rows.length; i++) {
            rows.push(results.rows.item(i));
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
          <View style={styles.row}>
            <Text style={[styles.cell, { flex: 1.2 }]}>{item.aadhaar_number}</Text>
            <Text style={[styles.cell, { flex: 1.5 }]}>{item.name}</Text>
            <Text style={[styles.cell, { flex: 1.3 }]}>{item.scanned_at}</Text>
          </View>
        )}
        ListHeaderComponent={() => (
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.headerCell, { flex: 1.2 }]}>Aadhaar</Text>
            <Text style={[styles.cell, styles.headerCell, { flex: 1.5 }]}>Name</Text>
            <Text style={[styles.cell, styles.headerCell, { flex: 1.3 }]}>Scanned At</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign: "center" }}>No records found</Text>}
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
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#ccc",
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  headerRow: {
    backgroundColor: "#E9ECEF",
    borderTopWidth: 1,
  },
  headerCell: {
    fontWeight: "bold",
    color: "#333",
  },
  cell: {
    textAlign: "center",
    fontSize: 13,
    color: "#333",
    paddingHorizontal: 4,
  },
});
