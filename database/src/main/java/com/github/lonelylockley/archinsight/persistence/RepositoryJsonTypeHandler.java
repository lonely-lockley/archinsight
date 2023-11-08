package com.github.lonelylockley.archinsight.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;
import org.postgresql.util.PGobject;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

@MappedJdbcTypes(JdbcType.OTHER)
@MappedTypes(value = RepositoryNode.class)
public class RepositoryJsonTypeHandler extends BaseTypeHandler<RepositoryNode> {

    private final ObjectMapper mapper = new ObjectMapper();
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, RepositoryNode parameter, JdbcType jdbcType) throws SQLException {
        try {
            PGobject jsonObject = new PGobject();
            jsonObject.setType("json");
            jsonObject.setValue(mapper.writeValueAsString(parameter));
            ps.setObject(i, jsonObject);
        }
        catch (Exception ex) {
            throw new SQLException("Error converting RepositoryNode to json", ex);
        }
    }

    private RepositoryNode getJsonObject(PGobject jsonObject) throws SQLException {
        try {
            if (jsonObject.isNull()) {
                return null;
            }
            else {
                return mapper.readValue(jsonObject.getValue(), RepositoryNode.class);
            }
        }
        catch (Exception ex) {
            throw new SQLException("Error converting RepositoryNode to json", ex);
        }
    }

    @Override
    public RepositoryNode getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return getJsonObject(rs.getObject(columnName, PGobject.class));
    }

    @Override
    public RepositoryNode getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return getJsonObject(rs.getObject(columnIndex, PGobject.class));
    }

    @Override
    public RepositoryNode getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return getJsonObject(cs.getObject(columnIndex, PGobject.class));
    }
}
