package com.ipchecker.badips;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "*")
public class BadIpsController {
    private static final Set<String> BAD_IPS = Set.of(
        "100.200.300.400",
        "101.201.301.401",
        "102.202.302.402",
        "103.203.303.403"
    );

    private boolean isIPv4(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length != 4) return false;
        for (String p : parts) {
            if (p.isEmpty()) return false;
        }
        return true;
    }

    @GetMapping("/")
    public ResponseEntity<?> checkBadIps(@RequestParam(value = "items", required = false) String items) {
        if (items == null || items.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", true, "message", "items parameter is required"));
        }

        List<Map<String, String>> results = new ArrayList<>();
        int totalBad = 0;
        for (String part : items.split(",")) {
            String ip = part.trim();
            if (ip.isEmpty()) {
                continue;
            }
            String status;
            if (!isIPv4(ip)) {
                status = "Invalid IP";
            } else if (BAD_IPS.contains(ip)) {
                status = "Bad IP";
                totalBad++;
            } else {
                status = "Good IP";
            }
            results.add(Map.of("ip", ip, "status", status));
        }

        return ResponseEntity.ok(
            Map.of(
                "error", false,
                "items", items,
                "total_bad_ips", totalBad,
                "results", results
            )
        );
    }
}
