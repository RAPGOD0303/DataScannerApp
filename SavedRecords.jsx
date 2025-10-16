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
import { useNavigation,useFocusEffect } from "@react-navigation/native";
import Icon from '@react-native-vector-icons/material-icons';

export default function SavedRecords() {
  const [records, setRecords] = useState([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [db, setDb] = useState(null);
  const navigation = useNavigation();

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
  // useEffect(() => {
  //   const db = SQLite.openDatabase(
  //     { name: "AadharDB.db", location: "default" },
  //     () => setDbReady(true),
  //     (error) => {
  //       console.error("❌ Failed to open database:", error);
  //       Alert.alert("Database Error", "Failed to open local database.");
  //     }
  //   );
  //   return () => db.close();
  // }, []);

  useEffect(() => {
    const database = SQLite.openDatabase(
      { name: "AadharDB.db", location: "default" },
      () => {
        setDb(database);
        setDbReady(true);
      },
      (err) => console.error("DB open error", err)
    );

    return () => database.close();
  }, []);

  // ------------------ FETCH RECORDS ------------------
  // const fetchRecords = useCallback(() => {
  //   const db = SQLite.openDatabase({ name: "AadharDB.db", location: "default" });
  //   db.transaction((tx) => {
  //     tx.executeSql(
  //       `SELECT * FROM AadharData ORDER BY datetime(scanned_at) ${sortAsc ? "ASC" : "DESC"}`,
  //       [],
  //       (_, results) => {
  //         const rows = [];
  //         for (let i = 0; i < results.rows.length; i++) {
  //           const item = results.rows.item(i);
  //           rows.push({
  //             ...item,
  //             formattedDate: formatDateTime(item.scanned_at),
  //           });
  //         }
  //         setRecords(rows);
  //       },
  //       (error) => console.error("SQL error:", error)
  //     );
  //   });
  // }, [sortAsc]);

 const fetchRecords = useCallback(() => {
    if (!dbReady || !db) return;

    db.transaction((tx) => {
      tx.executeSql(
        "SELECT * FROM AadharData ORDER BY id DESC",
        [],
        (_, results) => {
          const temp = [];
          for (let i = 0; i < results.rows.length; i++) temp.push(results.rows.item(i));

          setRecords(temp);
          console.log("Inside SaveRecords ", records)
        },
        (tx, err) => console.error("Fetch error:", err)
      );
    });
  }, [dbReady, db, records]);


  // useEffect(() => {
  //   if (dbReady) fetchRecords();
  // }, [dbReady, fetchRecords]);
  useFocusEffect(
    useCallback(() => {
      fetchRecords();
    }, [fetchRecords])
  );
  // ------------------ EXPORT CSV ------------------
  const exportToCSV = async () => {
    if (records.length === 0) {
      Alert.alert("No Data", "There are no records to export.");
      return;
    }

    const headers = ["ID", "Name", "Aadhaar Number", "DOB", "Gender","Mobile Number", "Address", "Scanned At"];

    const csvRows = records.map((r) =>
      [
        r.id,
        `"${r.name}"`,
        r.aadhaar_number,
        r.dob,
        r.gender,
        r.mobile,
        `"${r.address}"`,
        `"${r.formattedDate}"`,
      ].join(",")
    );

    const csvString = [headers.join(","), ...csvRows].join("\n");

    const filePath =
      Platform.OS === "android"
        ? `${RNFS.DownloadDirectoryPath}/AadharRecords_${Date.now()}.csv`
        : `${RNFS.DocumentDirectoryPath}/AadharRecords_${Date.now()}.csv`;

    try {
      await RNFS.writeFile(filePath, csvString, "utf8");

      Alert.alert(
        "✅ CSV Saved",
        `File saved to:\n${filePath}`,
        [
          {
            text: "Share",
            onPress: async () => {
              try {
                await Share.open({
                  title: "Share Aadhar Records CSV",
                  url: Platform.OS === "android" ? `file://${filePath}` : filePath,
                  type: "text/csv",
                });
              } catch (shareErr) {
                if (
                  shareErr?.message?.includes("User did not share") ||
                  shareErr?.error?.includes("User did not share")
                ) {
                  console.log("User cancelled sharing — no action needed.");
                  return;
                }
                console.error("Share Error:", shareErr);
                Alert.alert("Error", "Failed to share the CSV file.");
              }
            },
          },
          { text: "OK", style: "cancel" },
        ],
        { cancelable: true }
      );
    } catch (error) {
      console.error("CSV Export Error:", error);
      Alert.alert("Error", "Failed to export CSV file.");
    }
  };

  // ------------- UPDATE RECORD ---------------
  const handleUpdate = (record) => {
    console.log("📤 Navigating to Scan tab with record:", record);
    navigation.navigate("Scan", { record, refreshKey: Date.now()});
  };

  // ------------- DELETE RECORD ----------------
  const handleDelete = (recordId) => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete this record?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const db = SQLite.openDatabase({ name: "AadharDB.db", location: "default" });
            db.transaction((tx) => {
              tx.executeSql(
                `DELETE FROM AadharData WHERE id = ?`,
                [recordId],
                () => {
                  Alert.alert("Deleted", "Record deleted successfully.");
                  fetchRecords(); // refresh list
                },
                (err) => console.error("DB delete error:", err)
              );
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  // ------------------ UI ------------------
  return (
    <View style={styles.container}>
      {/* <TouchableOpacity onPress={() => setSortAsc(!sortAsc)}>
        <Text style={styles.sortButton}>
          Sort by Date ({sortAsc ? "Oldest" : "Newest"})
        </Text>
      </TouchableOpacity> */}

      <TouchableOpacity onPress={exportToCSV}>
        
      <View style={styles.downloadButton}>
          <Icon
            name="download"
            size={22}
            color="#ffffffff"
            style={{ marginRight: 6 }}
          />
          <Text style={{color:'#fff'}}>Download CSV</Text>
      </View>
      </TouchableOpacity>
    

      <FlatList
        data={records}
        keyExtractor={(item) => item.id?.toString() ?? Math.random().toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardContent}>
              {/* Left Side: Record Info */}
              <View style={styles.textContainer}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.subText}>Aadhaar: {item.aadhaar_number}</Text>
                <Text style={styles.subText}>
                  DOB: {item.dob || "N/A"} | Gender: {item.gender || "N/A"}
                </Text>
                <Text style={styles.subText}>
                  Mobile: {item.mobile || "N/A"}
                </Text>
                <Text style={styles.address} numberOfLines={2} ellipsizeMode="tail">
                  Address: {item.address || "N/A"}
                </Text>
                <Text style={styles.time}>🕒 Scanned At: {item.scanned_at}</Text>
              </View>

              {/* Right Side: Edit/Delete Buttons */}
              <View style={styles.actionContainer}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.editButton]}
                  onPress={() => handleUpdate(item)}
                >
                  <Text style={styles.actionText}>Edit</Text>


                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDelete(item.id)}
                >
                  <Text style={styles.actionText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
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

// ------------------ STYLES ------------------
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
    display:'flex',
    flexDirection:"row",
    justifyContent:'center',
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

  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  textContainer: {
    flex: 1,
    paddingRight: 10,
  },

  actionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  editButton: {
    backgroundColor: "#007aff",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  actionText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "bold",
  },

  title: { fontSize: 15, fontWeight: "bold", color: "#333" },
  subText: { fontSize: 13, color: "#555", marginTop: 2 },
  address: { fontSize: 13, color: "#444", marginTop: 4 },
  time: { fontSize: 12, color: "#007AFF", marginTop: 6, fontStyle: "italic" },
});
