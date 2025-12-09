package com.ipchecker.badips;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class BadIpsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void countsBadIps() throws Exception {
        mockMvc.perform(get("/").param("items", "103.203.303.403,1.1.1.1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total_bad_ips").value(1));
    }

    @Test
    void missingItems() throws Exception {
        mockMvc.perform(get("/"))
            .andExpect(status().isBadRequest());
    }
}
